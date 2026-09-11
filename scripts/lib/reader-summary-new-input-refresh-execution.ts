import { join } from "node:path";
import type { ConfiguredInterestReaderPort } from "@social-monitor/relevance/ports";
import type { PrismaReaderSummaryClient } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-client";
import { InMemoryMetricsRecorder } from "@social-monitor/platform-metrics";
import type { PrismaSummaryConnection } from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-connection";
import { PrismaReaderSummaryArtifactRepository } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-artifact.repository";
import { PrismaReaderSummaryJobRepository } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-job.repository";
import { PrismaReaderSummaryPolicyRepository } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-policy.repository";
import { PrismaReaderSummaryPublication, type ReaderSummaryPublicationTransactionGuard } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-publication";
import { ReaderSummaryPromotionMetricsRecorder } from "@social-monitor/summary/adapters/metrics/reader-summary-promotion-metrics.recorder";
import { ExecuteReaderSummaryJobUseCase } from "@social-monitor/summary/features/execute-reader-summary-job/execute-reader-summary-job.use-case";
import { RequestReaderSummaryUseCase } from "@social-monitor/summary/features/request-reader-summary/request-reader-summary.use-case";
import { readerSummaryPromotionControl } from "@social-monitor/summary/features/execute-reader-summary-job/reader-summary-promotion-control";
import { CryptoIdGenerator, tenantId, workspaceId, type Clock } from "@social-monitor/shared-kernel";
import type { AgentRuntimeClientPort, ReaderSummaryPublicationPort, ReaderSummaryJobRepositoryPort } from "@social-monitor/summary/ports";
import type { FeedItemReadRepositoryPort, PromotionFeedItemSnapshotRepositoryPort } from "@social-monitor/feed/ports";
import { createReaderSummaryDailyCapturePublicationWiring } from "./reader-summary-daily-story-relation-verifier";
import { assertRefreshManifest, refreshScope, type RefreshManifest } from "./reader-summary-new-input-refresh-manifest";
import { NewInputRefreshGuard, assertRefreshEqual, reconcileRefresh, refreshLiveJobs } from "./reader-summary-new-input-refresh-guard";
import { captureRefreshAuthority, captureRefreshDatabaseAuthority, refreshPeriod, assertRefreshHasNewInput, preflightRefreshSelection } from "./reader-summary-new-input-refresh-capture";
import { readRefreshJobs, readRefreshPrior, readRefreshCounts, readRefreshReconciliations } from "./reader-summary-new-input-refresh-postgres";
import { createRefreshAdmission } from "./reader-summary-new-input-refresh-admission";
import { withRefreshPublicationLocks, type RefreshSnapshotProtection } from "./reader-summary-new-input-refresh-publication-lock";
import { buildRefreshModelWiring, guardedRefreshRuntime } from "./reader-summary-new-input-refresh-model";
import { createRefreshAssessmentReviewer, hasRefreshSelectableEvidence,
  withRefreshAssessmentCompletion } from "./reader-summary-new-input-refresh-assessment";
import { RefreshPairedExport } from "./reader-summary-new-input-refresh-paired-export";
import { refreshCaptureModelControls } from "./reader-summary-new-input-refresh-model";
import { withRefreshSelectionAudit } from "./reader-summary-new-input-refresh-selection-audit";
import { assertRefreshSuccessorCurrent, consumeRefreshSuccessor } from "./reader-summary-new-input-refresh-successor";

type RefreshExecutionInput = {
  capturePath?: string;
  configuredInterests: ConfiguredInterestReaderPort;
  manifest: RefreshManifest; summary: PrismaSummaryConnection;
  feed: FeedItemReadRepositoryPort & PromotionFeedItemSnapshotRepositoryPort;
  clock: Clock; env: NodeJS.ProcessEnv;
  runtime: AgentRuntimeClientPort;
  assertFences(): void; assertSource(): void; assertRuntime(): Promise<void>;
  record(event: unknown): void;
};

export async function executeNewInputRefresh(input: RefreshExecutionInput) {
  if (input.capturePath === undefined) return executeRefresh(input);
  const capture = new RefreshPairedExport(input.capturePath, input.manifest, () => input.clock.now().getTime());
  let completed = false;
  try {
    const result = await executeRefresh(input, capture);
    completed = result.status === "published";
    return result;
  } finally {
    // A capture failure is reported independently; never turns a consumed job
    // into a retry or changes its publication policy.
    try {
      const result = await capture.finish(completed);
      try { input.record({ status: "paired_capture", path: result.path, complete: result.complete,
        failures: result.failures, unresolvedCandidateCount: result.unresolvedCandidateCount }); } catch { /* no retry */ }
    } catch {
      try { input.record({ status: "paired_capture", complete: false, failures: ["capture_finalization_failed"] }); } catch { /* no retry */ }
    }
  }
}

async function executeRefresh(input: RefreshExecutionInput, capture?: RefreshPairedExport) {
  const { manifest: m, summary, feed, clock } = input;
  input.assertFences(); input.assertSource();
  const countsBefore = await readRefreshCounts(summary, m.date);
  const current = await readRefreshPrior(summary, m.date);
  const prior = await readRefreshPrior(summary, m.date, m.prior.publicationId);
  assertRefreshEqual(prior, m.prior, "preserved prior");
  input.record({ status: "before", operation: m.operation, observedThrough: m.observedThrough, prior, countsBefore });
  // Live budget for this date, after subtracting explicitly reconciled consumed
  // attempts. Reading both together keeps a mid-run reconciliation from ever
  // retiring THIS attempt's own job.
  const liveRefreshJobs = async (client: Pick<PrismaSummaryConnection, "$queryRaw"> = summary) =>
    refreshLiveJobs(await readRefreshJobs(client, m.date),
      await readRefreshReconciliations(client, m.date), m.operation);
  const jobs = await readRefreshJobs(summary, m.date);
  const reconciled = await readRefreshReconciliations(summary, m.date);
  if (m.successor) {
    assertRefreshManifest(m, clock.now());
    await assertRefreshSuccessorCurrent(summary, m, clock.now());
    if (jobs.some((job) => job.operation === m.operation)) throw new Error("Refresh successor already consumed");
  }
  const admissionState = reconcileRefresh(m, jobs, current, reconciled);
  if (admissionState === "published") {
    const countsAfter = await readRefreshCounts(summary, m.date);
    assertRefreshEqual(countsAfter, countsBefore, "replay counts");
    return { status: "verified_noop", before: prior, after: current, countsBefore, countsAfter,
      publicationDelta: countsAfter.publications - countsBefore.publications, outboxDelta: countsAfter.outbox - countsBefore.outbox };
  }
  input.record({ status: "admission", operation: m.operation, admissionState,
    reconciled: reconciled.map(({ reconciliationId, jobId, operation }) =>
      ({ reconciliationId, jobId, operation })) });
  const assertCurrent = async (client = summary as Pick<PrismaSummaryConnection, "$queryRaw">) => {
    input.assertFences(); input.assertSource();
    assertRefreshEqual(await readRefreshPrior(client, m.date), m.prior, "old slot/content/proof");
    assertRefreshEqual(await captureRefreshAuthority({ client, feed, date: m.date,
      observedThrough: new Date(m.observedThrough), clock }), m.authority, "input/engagement/config");
  };
  assertRefreshManifest(m, clock.now());
  await assertCurrent();
  await assertRefreshHasNewInput(summary, m.date, m.prior.observedThrough, m.observedThrough);
  await input.assertRuntime();
  const { assessmentCandidateCount, canonicalEvidence } = await preflightRefreshSelection({ configuredInterests: input.configuredInterests, feed, date: m.date,
    observedThrough: new Date(m.observedThrough), clock });
  const hasSelectableEvidence = hasRefreshSelectableEvidence(canonicalEvidence);
  input.record({ status: "preflight", operation: m.operation, assessmentCandidateCount,
    plannedSummaryGenerations: assessmentCandidateCount === 0 && !hasSelectableEvidence ? 0 : 1 });
  if (assessmentCandidateCount === 0 && !hasSelectableEvidence) {
    await assertCurrent();
    const countsAfter = await readRefreshCounts(summary, m.date);
    assertRefreshEqual(countsAfter, countsBefore, "empty input counts");
    return { status: "no_eligible_input", before: prior, after: current, countsBefore, countsAfter,
      publicationDelta: 0, outboxDelta: 0 };
  }
  const policies = new PrismaReaderSummaryPolicyRepository(summary);
  const policy = await policies.findByScope({ tenantId: tenantId(m.tenantId),
    workspaceId: workspaceId(m.workspaceId), scope: { type: "workspace" } });
  if (policy === null) throw new Error("Refresh cannot fall back to a default policy");
  await assertCurrent();
  const jobRepo = new PrismaReaderSummaryJobRepository(summary);
  const ids = new CryptoIdGenerator();
  const period = refreshPeriod(m.date);
  const admission = createRefreshAdmission(m, {
    assertCurrent: async () => {
      assertRefreshManifest(m, clock.now());
      await assertCurrent();
      if ((await liveRefreshJobs()).length !== 0) throw new Error("Refresh date budget consumed");
      input.assertSource(); input.assertFences(); assertRefreshManifest(m, clock.now());
    },
  });
  const requestRepo: ReaderSummaryJobRepositoryPort = m.successor ? {
    findById: (query) => jobRepo.findById(query),
    findByIdempotencyKey: (query) => jobRepo.findByIdempotencyKey(query),
    findRequested: (query) => jobRepo.findRequested(query),
    claimForExecution: (command) => jobRepo.claimForExecution(command),
    saveExecutionOutcome: (command) => jobRepo.saveExecutionOutcome(command),
    save: (job) => consumeRefreshSuccessor({ summary, manifest: m, job, clock,
      assertLocal: () => { input.assertSource(); input.assertFences(); } }),
  } : jobRepo;
  const request = await new RequestReaderSummaryUseCase(requestRepo,
    admission.queue, admission.quota, ids, clock).execute({
    tenantId: tenantId(m.tenantId), workspaceId: workspaceId(m.workspaceId), scope: { type: "workspace" },
    cadence: "daily", period, idempotencyKey: m.operation, correlationId: m.operation,
  });
  if (!request.ok || !request.value.created) throw new Error("Refresh request requires original-job reconciliation");
  input.record({ status: "operation_consumed", operation: m.operation, jobId: request.value.readerSummaryJobId });
  const guard = new NewInputRefreshGuard(m, request.value.readerSummaryJobId, {
    now: () => clock.now(), assertFences: input.assertFences, assertCurrent: async () => {
      const owned = await liveRefreshJobs();
      if (owned.length !== 1 || owned[0]?.jobId !== request.value.readerSummaryJobId || owned[0].operation !== m.operation ||
          !["REQUESTED", "RUNNING"].includes(owned[0].status) || owned[0].artifactId !== null) {
        throw new Error("Refresh date has conflicting consumed operations");
      }
      await assertCurrent();
    },
  });
  const runtime = guardedRefreshRuntime({ delegate: input.runtime, manifest: m, now: () => clock.now().getTime(),
    assertLocal: () => { input.assertSource(); guard.assertLocal(); },
    assertCurrent: async () => { await input.assertRuntime(); await guard.assertCurrent(); }, record: input.record,
    ...(capture === undefined ? {} : { capture: capture.model, captureFailure: () => capture.fail("model_callback_failed") }) });
  const sink = { record: (attestation: unknown) => {
    try { runtime.assertUsable(); input.record({ status: "verified_attestation", attestation }); }
    catch (error) { guard.invalidate(); throw error; }
  } };
  const assessment = createRefreshAssessmentReviewer({ env: input.env, runtime, clock, canonicalEvidence,
    ...(capture === undefined ? {} : { capture: capture.assessment, captureCanonical: (value) => capture.canonicalBindings(value) }) });
  if (capture) {
    try {
      capture.controls({ manifest: m, policy: policy.toSnapshot(), model: refreshCaptureModelControls(input.env),
        canonicalEvidence, assessmentTiming: assessment.promotionTiming });
    } catch { capture.fail("controls_capture_failed"); }
    capture.assessmentCompletion(() => assessment.assertCaptureComplete());
  }
  const reservedCaptureRoot = capture?.reservedDirectory;
  const canonical = createReaderSummaryDailyCapturePublicationWiring({
    ...(reservedCaptureRoot === undefined ? {} : { headlineDiagnosticArtifact: {
      path: join(reservedCaptureRoot, "headline-diagnostic.json"), attemptId: request.value.readerSummaryJobId,
    } }),
    qualityReviewer: assessment,
    replay: null, configuredInterests: capture?.interests(input.configuredInterests) ?? input.configuredInterests,
    feedItems: capture?.feed(feed) ?? feed, summaryClient: summary, clock, attestationSink: sink,
    ...(capture === undefined ? {} : { preparationObserver: capture.observer, relationCapture: capture.relations,
      rankCommandCapture: { captured: (value) => capture.rankCommand(value), failed: () => capture.fail("rank_command_callback_failed") } }),
    summaryModelMode: "agent-runtime", env: input.env, agentRuntimeClient: runtime,
    storyRelationVerifierGuard: runtime,
  });
  const model = buildRefreshModelWiring(input.env, runtime, sink);
  const publication: ReaderSummaryPublicationPort = {
    publish: async (command) => {
      await guard.assertCurrent(); // Full canonical snapshot before taking a pool slot.
      await input.assertRuntime();
      runtime.assertUsable();
      return withRefreshPublicationLocks(summary, (assertProtected) => {
        runtime.assertUsable(); // Lock acquisition may outlive the evidence/fence.
        return new PrismaReaderSummaryPublication(summary, refreshPublicationGuard({
          assertLocal: () => { runtime.assertUsable(); guard.assertLocal(); },
          assertCurrent: (tx) => assertRefreshTransactionAuthority(tx, m, request.value.readerSummaryJobId, clock),
          assertProtected, manifest: m, jobId: request.value.readerSummaryJobId,
        })).publish(command);
      });
    },
  };
  const execution = await new ExecuteReaderSummaryJobUseCase(jobRepo,
    new PrismaReaderSummaryArtifactRepository(summary), {
      findByScope: async () => { await guard.assertCurrent(); return policy; },
      listScheduled: (query) => policies.listScheduled(query),
      save: async () => { throw new Error("Refresh policy mutation is prohibited"); },
    },
    withRefreshSelectionAudit({ selector: guard.selector(withRefreshAssessmentCompletion(
      (capture?.selector(canonical.evidenceSelector) ?? canonical.evidenceSelector), assessment, assessmentCandidateCount)), manifest: m,
      jobId: request.value.readerSummaryJobId, record: input.record, invalidate: () => guard.invalidate() }),
    model.model, publication, ids, clock,
    readerSummaryPromotionControl(new ReaderSummaryPromotionMetricsRecorder(new InMemoryMetricsRecorder())),
    undefined, undefined, model.topicMap, undefined, canonical.githubProjectionReader,
    undefined, undefined, undefined, guard,
  ).execute({ tenantId: tenantId(refreshScope.tenantId), workspaceId: workspaceId(refreshScope.workspaceId),
    readerSummaryJobId: request.value.readerSummaryJobId, maxEvidenceItems: 120 });
  if (!execution.ok) throw new Error("Refresh execution failed; reconcile the consumed job");
  const after = await readRefreshPrior(summary, m.date);
  if (reconcileRefresh(m, await readRefreshJobs(summary, m.date), after,
    await readRefreshReconciliations(summary, m.date)) !== "published") {
    throw new Error("Refresh publication requires reconciliation");
  }
  assertRefreshEqual(await readRefreshPrior(summary, m.date, m.prior.publicationId), m.prior, "preserved prior");
  const countsAfter = await readRefreshCounts(summary, m.date);
  for (const key of ["publications", "outbox", "jobs", "artifacts"] as const) {
    if (countsAfter[key] - countsBefore[key] !== 1) throw new Error("Refresh counts require reconciliation");
  }
  return { status: "published", before: prior, after, countsBefore, countsAfter,
    publicationDelta: countsAfter.publications - countsBefore.publications, outboxDelta: countsAfter.outbox - countsBefore.outbox };
}

export function refreshPublicationGuard(input: {
  assertLocal(): void;
  assertProtected: RefreshSnapshotProtection;
  assertCurrent(client: PrismaReaderSummaryClient): Promise<void>;
  manifest: RefreshManifest; jobId: string;
}): ReaderSummaryPublicationTransactionGuard {
  return async (tx, command) => {
    input.assertLocal();
    await input.assertProtected(tx);
    input.assertLocal();
    await input.assertCurrent(tx);
    input.assertLocal();
    const artifact = command.artifact.toSnapshot();
    if (artifact.sourceWindow.ingestionCutoff?.toISOString() !== input.manifest.observedThrough ||
        command.finalJob.toSnapshot().id !== input.jobId) {
      throw new Error("Refresh publisher lost operation/cutoff authority");
    }
    input.assertLocal();
  };
}

export async function assertRefreshTransactionAuthority(
  tx: Pick<PrismaSummaryConnection, "$queryRaw">, m: RefreshManifest, jobId: string, clock: Clock,
): Promise<void> {
  assertRefreshManifest(m, clock.now());
  const jobs = refreshLiveJobs(await readRefreshJobs(tx, m.date),
    await readRefreshReconciliations(tx, m.date), m.operation);
  if (jobs.length !== 1 || jobs[0]?.jobId !== jobId || jobs[0].operation !== m.operation || jobs[0].status !== "RUNNING") {
    throw new Error("Refresh transaction lost consumed job authority");
  }
  assertRefreshEqual(await readRefreshPrior(tx, m.date), m.prior, "old slot/content/proof");
  const { canonicalInputSha256, eligibleCount, ...database } = m.authority;
  void canonicalInputSha256; void eligibleCount;
  assertRefreshEqual(await captureRefreshDatabaseAuthority({ client: tx, date: m.date, clock }),
    database, "complete canonical rows/engagement/config");
  assertRefreshManifest(m, clock.now());
}
