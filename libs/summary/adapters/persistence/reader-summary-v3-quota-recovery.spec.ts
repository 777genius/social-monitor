import { DomainError, err, FixedClock, tenantId, workspaceId } from
  "@social-monitor/shared-kernel";
import { ReaderSummaryJob, ReaderSummaryPublicationPolicy,
  readerSummaryWorkspaceManifestSha256,
  type ReaderSummaryPublicationDecision } from "../../domain";
import { DeterministicReaderSummaryModelAdapter } from
  "../model/deterministic-reader-summary-model.adapter";
import { InMemoryReaderSummaryJobRepository } from
  "./in-memory-reader-summary-job.repository";
import { InMemoryReaderSummaryV3Preflight } from
  "./in-memory-reader-summary-v3-preflight";
import { makeReaderEvidenceSelection } from
  "../../test-fixtures/execute-reader-summary-job-promotion-fixtures";
import type { BuildReaderSummaryTopicMapUseCase } from
  "../../features/build-reader-summary-topic-map/build-reader-summary-topic-map.use-case";
import type { ReaderSummaryArtifactRepositoryPort, ReaderSummaryPolicyRepositoryPort,
  ReaderSummaryPublicationPort } from "../../ports";
import { GetReaderSummaryJobStatusUseCase } from
  "../../features/get-reader-summary-job-status/get-reader-summary-job-status.use-case";
import { ExecuteReaderSummaryJobUseCase } from
  "../../features/execute-reader-summary-job/execute-reader-summary-job.use-case";
import { RequestReaderSummaryUseCase } from
  "../../features/request-reader-summary/request-reader-summary.use-case";
import { NOOP_READER_SUMMARY_PROMOTION_METRICS,
  readerSummaryPromotionControl } from
  "../../features/execute-reader-summary-job/reader-summary-promotion-control";
import { candidate, TestPresentation, workspaceSetup } from
  "../evidence/relevance-reader-summary-v3-promotion.fixture";

const at = new Date("2026-06-26T08:00:00.000Z");
const due = new Date(at.getTime() + 60_000);
const tenant = tenantId("v3-quota-tenant");
const workspace = workspaceId("v3-quota-workspace");
const key = { tenantId: tenant, workspaceId: workspace,
  readerSummaryJobId: "v3-quota-job" };
const config = { schemaVersion: "reader_summary_preparation_config.v1" as const,
  interestId: "v3-quota-interest", interestSha256: "1".repeat(64),
  rubricVersion: "reader-value.v1", rubricSha256: "2".repeat(64),
  inputBuilderVersion: "input.v1", modelConfigVersion: "jev.v1" };
const manifest = { schemaVersion: "reader_summary_preparation_manifest.v1" as const,
  cutoffAt: "2026-06-26T08:00:00.000000Z",
  interestSha256: config.interestSha256, rubricSha256: config.rubricSha256,
  inputBuilderVersion: config.inputBuilderVersion,
  modelConfigVersion: config.modelConfigVersion, candidates: [] };

const preparedJob = () => ReaderSummaryJob.request({ id: key.readerSummaryJobId,
  tenantId: tenant, workspaceId: workspace,
  scope: { type: "interest", interestId: config.interestId },
  period: { cadence: "custom", startedAt: new Date("2026-06-26T06:00:00Z"),
    endedAt: new Date("2026-06-26T09:00:00Z"), timezone: "UTC",
    periodKey: "custom:2026-06-26T06:00:00.000Z:2026-06-26T09:00:00.000Z:UTC" },
  idempotencyKey: "v3-quota-job", requestedAt: at,
  selectionStrategy: "jev_primary_v3" }).freezePreparation({
    strategy: "jev_primary_v3", config, cutoffAt: manifest.cutoffAt,
    deadlineAt: "2026-06-26T08:15:00.000000Z",
    nextCheckAt: new Date(at.getTime() + 10_000),
  }).freezePreparationManifest({ manifest, manifestSha256: "3".repeat(64) });

const published: ReaderSummaryPublicationDecision = { status: "published",
  qualityPassed: true, canonicalScore: 1, reasons: ["fixture"],
  shadow: { mode: "shadow", policyVersion: "reader_summary_publication_shadow_v1",
    riskScore: 0, signals: [] } };
class PublishingPolicy extends ReaderSummaryPublicationPolicy {
  override evaluate(): ReaderSummaryPublicationDecision { return published; }
}

const scenario = async (topicMapBuilder?: BuildReaderSummaryTopicMapUseCase,
  promotionFixture?: ReturnType<typeof workspaceSetup>) => {
  const jobs = new InMemoryReaderSummaryJobRepository();
  const promoted = promotionFixture?.job.toSnapshot();
  const promotedManifest = promotionFixture?.manifest;
  const prepared = promoted === undefined || promotedManifest === undefined
    ? preparedJob()
    : ReaderSummaryJob.request({ id: promoted.id,
        tenantId: promoted.tenantId, workspaceId: promoted.workspaceId,
        scope: promoted.scope, period: promoted.period,
        idempotencyKey: promoted.idempotencyKey,
        requestedAt: promoted.requestedAt,
        selectionStrategy: "jev_primary_v3" }).freezePreparation({
          strategy: "jev_primary_v3", config: {
            schemaVersion: "reader_summary_preparation_config.v2",
            interests: promotedManifest.interests },
          cutoffAt: promotedManifest.cutoffAt,
          deadlineAt: "2026-09-21T00:15:00.000000Z",
          nextCheckAt: new Date("2026-09-21T00:00:10Z"),
        }).freezePreparationManifest({ manifest: promotedManifest,
          manifestSha256: readerSummaryWorkspaceManifestSha256(promotedManifest) });
  await jobs.save(prepared);
  const preflight = new InMemoryReaderSummaryV3Preflight(jobs, {
    configuration: async () => { throw new Error("Configuration was already frozen"); },
    prepare: async () => { throw new Error("Manifest was already frozen"); },
    coverage: async () => ({ status: "ready" }),
  });
  const model = new DeterministicReaderSummaryModelAdapter();
  const publication: ReaderSummaryPublicationPort = {
    publish: async (command) => {
      if (!await jobs.saveExecutionOutcome({ job: command.finalJob,
        expectedStartedAt: command.finalJob.toSnapshot().startedAt! })) return "stale";
      return "published";
    },
  };
  const execute = (now: Date) => new ExecuteReaderSummaryJobUseCase(
    jobs, { save: async () => undefined } as unknown as ReaderSummaryArtifactRepositoryPort,
    { findByScope: async () => null } as unknown as ReaderSummaryPolicyRepositoryPort,
    {} as never, model, publication, { generate: () => "v3-quota-artifact" },
    new FixedClock(now),
    readerSummaryPromotionControl(NOOP_READER_SUMMARY_PROMOTION_METRICS),
    undefined, undefined, topicMapBuilder, new PublishingPolicy(),
    undefined, undefined, undefined, undefined, undefined, preflight,
    promotionFixture?.subject ??
      { build: async () => ({ kind: "ready", evidence: makeReaderEvidenceSelection() }) },
  );
  const preparedSnapshot = prepared.toSnapshot();
  return { jobs, model, execute, jobKey: { tenantId: preparedSnapshot.tenantId,
    workspaceId: preparedSnapshot.workspaceId, readerSummaryJobId: preparedSnapshot.id } };
};

describe("V3 quota recovery", () => {
  it("does not rerun a successful writer when topic-map quota fails", async () => {
    const topicMap = { execute: async () => err(new DomainError(
      "external.dependency_unavailable", "Topic-map provider quota exceeded")) } as
      unknown as BuildReaderSummaryTopicMapUseCase;
    const { jobs, model, execute } = await scenario(topicMap);
    const writer = jest.spyOn(model, "generate");

    await execute(at).execute(key);
    expect(writer).toHaveBeenCalledTimes(1);
    expect((await jobs.findById(key))?.toSnapshot()).toMatchObject({
      status: "failed", failureReason: "Topic-map provider quota exceeded" });
    expect(await jobs.findDueForPolling({ now: due, limit: 1,
      staleRunningStartedBefore: new Date(0) })).toEqual([]);
    await execute(due).execute(key);
    expect(writer).toHaveBeenCalledTimes(1);
  });

  it("fails closed on a typed writer quota rejection and never replays provider work", async () => {
    const { jobs, model, execute } = await scenario();
    const writer = jest.spyOn(model, "generate");
    writer.mockRejectedValueOnce(Object.assign(new Error("Writer quota"), {
      failure: { kind: "provider_rate_limited", retryable: true,
        message: "Writer quota" },
    }));

    await execute(at).execute(key);
    expect((await jobs.findById(key))?.toSnapshot()).toMatchObject({
      status: "failed", failureReason: "Writer quota",
      terminalFailureCode: "provider_execution_failed",
      preparationNextCheckAt: undefined });
    const pending = await new GetReaderSummaryJobStatusUseCase(jobs).execute(key);
    expect(pending).toMatchObject({ ok: true, value: {
      status: "failed", failureReason: "Writer quota",
      failureClass: "system_failure" } });
    expect(JSON.stringify(pending)).not.toContain("v3_");
    expect(await jobs.findDueForPolling({ now: at, limit: 1,
      staleRunningStartedBefore: new Date(0) })).toEqual([]);
    await execute(at).execute(key);
    expect(writer).toHaveBeenCalledTimes(1);

    expect(await jobs.findDueForPolling({ now: due, limit: 1,
      staleRunningStartedBefore: new Date(0) })).toEqual([]);
    const result = await execute(due).execute(key);
    expect(result).toMatchObject({ ok: true, value: { status: "failed" } });
    expect(writer).toHaveBeenCalledTimes(1);
    expect(await new GetReaderSummaryJobStatusUseCase(jobs).execute(key))
      .toMatchObject({ ok: true, value: { status: "failed" } });
  });

  it("does not repeat 32 real presentations after writer quota or a later sweep", async () => {
    const presentation = new TestPresentation();
    const fixture = workspaceSetup(Array.from({ length: 32 }, (_, index) =>
      candidate(index + 1, "useful", "relevant")), undefined, presentation);
    const { jobs, model, execute, jobKey } = await scenario(undefined, fixture);
    const writer = jest.spyOn(model, "generate").mockRejectedValue(
      Object.assign(new Error("Writer quota"), { failure: {
        kind: "provider_rate_limited", retryable: true,
        message: "Writer quota" } }));
    const first = await execute(new Date("2026-09-21T00:00:00Z")).execute(jobKey);
    expect(first).toMatchObject({ ok: false });
    expect(presentation.attempted).toBe(32);
    expect(writer).toHaveBeenCalledTimes(1);
    expect((await jobs.findById(jobKey))?.toSnapshot()).toMatchObject({
      status: "failed", terminalFailureCode: "provider_execution_failed",
      preparationNextCheckAt: undefined });

    const later = new Date("2026-09-22T00:00:00Z");
    expect(await jobs.findDueForPolling({ now: later, limit: 10,
      staleRunningStartedBefore: later })).toEqual([]);
    expect(await execute(later).execute(jobKey)).toMatchObject({ ok: true,
      value: { status: "failed" } });
    expect(presentation.attempted).toBe(32);
    expect(writer).toHaveBeenCalledTimes(1);

    const snapshot = (await jobs.findById(jobKey))!.toSnapshot();
    const replay = await new RequestReaderSummaryUseCase(jobs,
      { enqueue: async () => { throw new Error("Replay must not enqueue"); } } as never,
      { reserveSummaryJob: async () => { throw new Error("Replay must not reserve"); } },
      { generate: () => "unused" }, new FixedClock(later)).execute({
        tenantId: snapshot.tenantId, workspaceId: snapshot.workspaceId,
        scope: snapshot.scope, cadence: snapshot.period.cadence,
        period: { startedAt: snapshot.period.startedAt,
          endedAt: snapshot.period.endedAt, timezone: snapshot.period.timezone },
        idempotencyKey: snapshot.idempotencyKey, correlationId: "quota-replay",
      });
    const get = await new GetReaderSummaryJobStatusUseCase(jobs).execute(jobKey);
    expect(replay).toMatchObject({ ok: true, value: { status: "failed" } });
    expect(get).toMatchObject({ ok: true, value: {
      status: "failed", failureClass: "system_failure" } });
    expect(JSON.stringify(get)).not.toContain("v3_");
  });
});
