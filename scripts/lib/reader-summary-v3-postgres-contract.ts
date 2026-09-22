import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { withPrismaWriteRetry } from "@social-monitor/platform-persistence";
import { readerSummaryV3PublicationGuard } from
  "../../libs/summary/adapters/persistence/prisma/prisma-reader-summary-v3-publication-guard";
import { PrismaReaderSummaryV3Preflight } from
  "../../libs/summary/adapters/persistence/prisma/prisma-reader-summary-v3-preflight";
import { PrismaReaderSummaryJobRepository } from
  "../../libs/summary/adapters/persistence/prisma/prisma-reader-summary-job.repository";
import { readerSummaryArtifactFromPrisma, type PrismaReaderSummaryArtifactRecord } from
  "../../libs/summary/adapters/persistence/prisma/prisma-reader-summary-records";
import { sealReaderPostPresentationV3 } from
  "../../libs/summary/domain/services/reader-post-presentation-v3";
import { canonicalPromotionPayload, promotionPayloadDigest } from
  "../../libs/summary/domain/services/reader-post-promotion-attestation";
import type { ReaderSummaryPublicationCommand } from "../../libs/summary/ports";
import type { ReaderSummaryV3PreparationSourcePort } from "../../libs/summary/ports";
import type { PrismaReaderSummaryClient } from
  "../../libs/summary/adapters/persistence/prisma/prisma-reader-summary-client";
import { ReaderSummaryArtifact, selectReaderPostPromotionsV3,
  type ReaderPostPromotionAttestationV3, type ReaderPostPromotionV3Candidate,
  type ReaderSummaryJob,
  type SummaryEvidenceSelection } from
  "../../libs/summary/domain";
import { buildReaderSummaryDraftWithPromotionContent } from
  "../../libs/summary/features/execute-reader-summary-job/reader-summary-promotion-content";
import { buildReaderSummaryPromotionArtifactFields } from
  "../../libs/summary/features/execute-reader-summary-job/reader-summary-promotion-artifact-fields";
import { serializeReaderSummaryArtifact } from
  "../../libs/summary/adapters/persistence/prisma/prisma-reader-summary-json";
import { presentReaderSummaryArtifact } from
  "../../libs/summary/features/shared/reader-summary-artifact-presenter";
import { validReaderDisplayRestBinding } from
  "../../libs/summary/interfaces/rest/reader-summary-display-rest-binding";
import { readerSummaryArtifactViewFromReaderSummaryView } from
  "../../libs/summary/interfaces/rest/reader-summary-rest.mapper";
import type { ReaderSummaryPublicationRunningFixture } from
  "./reader-summary-publication-postgres-running-fixture";
import { assertPostgres as assert, assertPostgresRejects as assertRejects } from
  "./reader-summary-publication-postgres-assertions";
import { sha256, stableJson } from
  "./reader-summary-weekly-publication-evidence-postgres-contract";
import { postgresPreflightClient } from
  "./reader-summary-v3-postgres-preflight-client";
import { runProductionV3Preflight, seedProductionReaderValueCapture } from
  "./reader-summary-v3-postgres-production-preflight";
import { completeProductionV3Assessment, fixtureReaderValueAnswers } from
  "./reader-summary-v3-postgres-assessment-lifecycle";
import { assertFlutterV3FixtureFresh } from
  "./reader-summary-v3-postgres-flutter-fixture";
type Params = {
  readonly client: PoolClient;
  readonly concurrentClient: PoolClient;
  readonly createFixture: (status: "COMPLETED" | "NO_SIGNAL", day: number,
    overrides?: { readonly requestedAt?: string; readonly publicationInterestId?: string;
      readonly providerEvidence?: "default" | "none" | "reddit" | "rss";
      readonly providerPublishedAt?: string;
      readonly providerObservedAt?: string;
      readonly payloadTransform?: (payload: Readonly<Record<string, unknown>>) =>
        Promise<{ readonly payload: Readonly<Record<string, unknown>>;
          readonly applicationArtifact?: ReaderSummaryArtifact }> }) =>
    Promise<ReaderSummaryPublicationRunningFixture>;
  readonly publish: (client: PoolClient,
    payload: Readonly<Record<string, unknown>>) => Promise<string>;
};
type V3ArtifactPayload = Record<string, unknown> & {
  citationMap: Array<Record<string, string>>;
  promotionAttestations?: ReaderPostPromotionAttestationV3[];
  content?: { topReads?: Array<Record<string, unknown>> };
};
type V3FixturePayload = Record<string, unknown> & {
  tenantId: string;
  workspaceId: string;
  interestId: string;
  readerSummaryArtifactId: string;
  requestedAt: string;
  periodStartedAt: string;
  periodEndedAt: string;
  periodTimezone: string;
  periodKey: string;
  modelVersion: string;
  report: Record<string, unknown> & {
    promptVersion: string;
    artifactPayload: V3ArtifactPayload;
  };
  exactProof: Record<string, unknown>;
};
export const assertReaderSummaryV3PostgresContract = async (params: Params) => {
  const cancelFirst = await preflightFixture(params, "NO_SIGNAL", 12);
  await params.client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  assert((await cancelLocked(params.client, cancelFirst)) === 1,
    "cancel-first must acquire the job before publication");
  const blockedPublication = params.publish(params.concurrentClient,
    cancelFirst.payload);
  await params.client.query("COMMIT");
  await assertRejects(() => blockedPublication,
    "cancel-first publication must reject");
  await assertCounts(params.client, cancelFirst, 0, 0);

  const publishFirst = await preflightFixture(params, "NO_SIGNAL", 13);
  await params.client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  assert(await params.publish(params.client, publishFirst.payload) === "published",
    "publish-first must acquire the job and publish");
  const blockedCancellation = cancelTransaction(params.concurrentClient,
    publishFirst);
  await params.client.query("COMMIT");
  assert((await blockedCancellation) === 0,
    "publish-first cancellation must report already published");
  assert(await params.publish(params.client, publishFirst.payload) === "replayed",
    "lost ACK must replay without generation");
  await assertCounts(params.client, publishFirst, 1, 1);

  const nested = await params.createFixture("COMPLETED", 14,
    { publicationInterestId: randomUUID(), providerEvidence: "rss",
      providerPublishedAt: "2026-06-14T09:00:00.123456Z",
      providerObservedAt: "2026-06-14T09:01:00.123456Z",
      requestedAt: "2026-06-14T10:00:00.123Z",
      payloadTransform: (source) => buildApplicationV3FixturePayload(
        params.client, source) });
  const payload = asV3Payload(nested.payload);
  await advanceV3Preflight(params.client, nested, payload);
  await assertMicrosecondCutoff(params.client, nested.jobId, payload);
  assert(await publishThroughApplicationGuard(params, nested, payload) === "published",
    "nested V3 must retain the V1 outer publication envelope");
  assert(await publishThroughApplicationGuard(params, nested, payload) === "replayed",
    "nested V3 replay must be exact");
  await assertApplicationPayloadRoundTrip(params.client, nested, payload);
  const changed = JSON.parse(JSON.stringify(payload));
  changed.report.artifactPayload.promotionAttestations[0].storyId = "changed";
  await assertRejects(() => publishThroughApplicationGuard(
    params, nested, changed, false),
    "changed completed replay must reject");
  await assertCounts(params.client, nested, 1, 1);

  await assertFrozenAuthorityTamperCases(params);

  await assertRevocationCommitOrders(params);
  await assertPreflightCompetingHandlers(params);
  await assertProductionPreflightDeadlineLockOutcomes(params);
  await assertProductionPreflightHydration(params);
  console.log("Reader summary V3 cancel/replay/revocation PostgreSQL 18 contract OK");
};
const assertFrozenAuthorityTamperCases = async (params: Params): Promise<void> => {
  const cases = ["exact cutoff", "assessment category", "assessment probability",
    "comparator assessment"] as const;
  for (const [index, name] of cases.entries()) {
    const target = await applicationFixture(params, 19 + index);
    const changed = mutateV3Artifact(target.fixture.applicationArtifact!, name);
    await assertRejects(() => publishThroughProductionEquivalentGuard(params.client,
      target.fixture, target.fixture.payload, params.publish, changed),
    `resealed ${name} tamper must reject against the unchanged frozen authority`);
    await assertCounts(params.client, target.fixture, 0, 0);
  }
};
const mutateV3Artifact = (artifact: ReaderSummaryArtifact,
  kind: "exact cutoff" | "assessment category" | "assessment probability" |
    "comparator assessment"): ReaderSummaryArtifact => {
  const snapshot = artifact.toSnapshot();
  const original = snapshot.promotionAttestations?.[0];
  if (original?.schemaVersion !== "reader_post_promotion_attestation.v3") {
    throw new Error("V3 tamper fixture attestation is missing");
  }
  let sourceWindow = snapshot.sourceWindow;
  let changed = original;
  if (kind === "exact cutoff") {
    const exact = original.exactIngestionCutoff.replace(/\.\d{6}Z$/u, ".123999Z");
    sourceWindow = { ...sourceWindow, ingestionCutoff: new Date(exact),
      exactIngestionCutoff: exact };
    changed = { ...changed, exactIngestionCutoff: exact,
      ingestionCutoff: new Date(exact) };
  } else if (kind === "assessment category") {
    const answer = original.assessment.answers.usefulness;
    const answers = { ...original.assessment.answers,
      usefulness: { ...answer, choice: "important" as const,
        probabilities: { ...answer.probabilities, useful: 0, important: 1 },
        choiceDiffersFromArgmax: false, probabilityTie: false } };
    changed = { ...changed, assessment: { ...changed.assessment, answers },
      comparator: { ...changed.comparator, usefulness: "important" } };
  } else if (kind === "assessment probability") {
    const answer = original.assessment.answers.usefulness;
    const answers = { ...original.assessment.answers,
      usefulness: { ...answer,
        probabilities: { ...answer.probabilities, useful: 0.8, important: 0.2 },
        confidence: 0.8, choiceDiffersFromArgmax: false, probabilityTie: false } };
    changed = { ...changed, assessment: { ...changed.assessment, answers } };
  } else {
    const answer = original.assessment.answers.relevance;
    const answers = { ...original.assessment.answers,
      relevance: { ...answer, choice: "relevant" as const,
        probabilities: { ...answer.probabilities, relevant: 1, central: 0 },
        choiceDiffersFromArgmax: false, probabilityTie: false } };
    changed = { ...changed, assessment: { ...changed.assessment, answers },
      comparator: { ...changed.comparator, relevance: "relevant" } };
  }
  const body = { ...changed } as Record<string, unknown>;
  delete body.canonicalPayload;
  delete body.digest;
  const canonicalPayload = canonicalPromotionPayload(body);
  const resealed = { ...changed, canonicalPayload,
    digest: promotionPayloadDigest(canonicalPayload) };
  return ReaderSummaryArtifact.rehydrate({ ...snapshot, sourceWindow,
    promotionAttestations: [resealed] });
};
const assertRevocationCommitOrders = async (params: Params): Promise<void> => {
  for (const [index, control] of (["interest", "source_binding", "feed_item",
    "source_metadata"] as const).entries()) {
    await assertRevocationFirst(params, 15 + index * 2, control);
    await assertPublicationFirst(params, 16 + index * 2, control);
  }
};
type RevocationControl = "interest" | "source_binding" | "feed_item" | "source_metadata";
const assertRevocationFirst = async (params: Params, day: number,
  control: RevocationControl): Promise<void> => {
  const target = await applicationFixture(params, day);
  const targetId = control === "interest" ? undefined : await sourceAuthorityId(
    params.client, target.fixture.payload, control);
  const publishPid = (await params.concurrentClient.query<{ readonly pid: number }>(
    "SELECT pg_backend_pid() AS pid",
  )).rows[0]!.pid;
  await params.client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  try {
    await assertTenantScopedRevocation(params.client, target, control, targetId);
    assert(await revokeControl(params.client, target, control, targetId) === 1,
      `${control} revocation-first update must target one scoped row`);
    const blocked = publishThroughProductionEquivalentGuard(params.concurrentClient,
      target.fixture, target.fixture.payload, params.publish);
    await waitForRowLock(params.client, publishPid);
    await params.client.query("COMMIT");
    await assertRejects(() => blocked,
      `${control} revocation-first publication must reject`);
  } catch (error) {
    await params.client.query("ROLLBACK");
    throw error;
  }
  await assertCounts(params.client, target.fixture, 0, 0);
  await assertTerminalRejection(params.client, target.fixture,
    control === "interest" ? "interest_changed" : "scope_changed");
  await assertRejects(() => publishThroughApplicationGuard(params,
    target.fixture, target.fixture.payload),
  `${control} subsequent worker attempt must remain rejected`);
  await assertTerminalRejection(params.client, target.fixture,
    control === "interest" ? "interest_changed" : "scope_changed");
  await assertCounts(params.client, target.fixture, 0, 0);
};

const assertPublicationFirst = async (params: Params, day: number,
  control: RevocationControl): Promise<void> => {
  const target = await applicationFixture(params, day);
  const targetId = control === "interest" ? undefined : await sourceAuthorityId(
    params.client, target.fixture.payload, control);
  const revocationPid = (await params.concurrentClient.query<{ readonly pid: number }>(
    "SELECT pg_backend_pid() AS pid",
  )).rows[0]!.pid;
  await params.client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  try {
    const guard = await readerSummaryV3PublicationGuard(taggedSqlClient(params.client),
      applicationGuardCommand(target.fixture));
    assert(guard === undefined || guard.allowed,
      `${control} publication-first application guard must accept`);
    const revocation = revokeControlTransaction(params.concurrentClient, target,
      control, targetId);
    await waitForRowLock(params.client, revocationPid);
    assert(await params.publish(params.client, target.fixture.payload) === "published",
      `${control} publication-first race must publish while holding revocation fences`);
    await params.client.query("COMMIT");
    assert(await revocation === 1,
      `${control} revocation must commit after publication`);
  } catch (error) {
    await params.client.query("ROLLBACK");
    throw error;
  }
  assert(await publishThroughApplicationGuard(params, target.fixture,
    target.fixture.payload) === "replayed",
  `${control} later worker must replay the committed publication`);
  await assertCounts(params.client, target.fixture, 1, 1);
};

const assertTenantScopedRevocation = async (client: PoolClient,
  target: Awaited<ReturnType<typeof applicationFixture>>,
  control: RevocationControl, targetId?: string): Promise<void> => {
  const fixture = target.fixture;
  const result = control === "interest"
    ? await client.query(`UPDATE interests SET status='DISABLED'
      WHERE tenant_id=$1::uuid AND workspace_id=$2::uuid AND id=$3::uuid`, [
      randomUUID(), payloadString(fixture, "workspaceId"), target.interestId])
    : await client.query(`${revocationSql(control)}
      WHERE tenant_id=$1::uuid AND workspace_id=$2::uuid AND id=$3::uuid`, [
      randomUUID(), payloadString(fixture, "workspaceId"), targetId]);
  assert(result.rowCount === 0, `${control} revocation must be tenant scoped`);
};

const revokeControl = async (client: PoolClient,
  target: Awaited<ReturnType<typeof applicationFixture>>,
  control: RevocationControl, targetId?: string): Promise<number> => {
  const fixture = target.fixture;
  const result = control === "interest"
    ? await client.query(`UPDATE interests SET status='DISABLED'
      WHERE tenant_id=$1::uuid AND workspace_id=$2::uuid AND id=$3::uuid`, [
      payloadString(fixture, "tenantId"), payloadString(fixture, "workspaceId"),
      target.interestId])
    : await client.query(`${revocationSql(control)}
      WHERE tenant_id=$1::uuid AND workspace_id=$2::uuid AND id=$3::uuid`, [
      payloadString(fixture, "tenantId"), payloadString(fixture, "workspaceId"),
      targetId]);
  return result.rowCount ?? 0;
};

const revokeControlTransaction = async (client: PoolClient,
  target: Awaited<ReturnType<typeof applicationFixture>>,
  control: RevocationControl, targetId?: string): Promise<number> => {
  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  try {
    const count = await revokeControl(client, target, control, targetId);
    await client.query("COMMIT");
    return count;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
};

const applicationFixture = async (params: Params, day: number) => {
  const interestId = randomUUID();
  const fixture = await params.createFixture("COMPLETED", day,
    { publicationInterestId: interestId, providerEvidence: "rss",
      providerPublishedAt: `2026-06-${day}T09:00:00.123456Z`,
      providerObservedAt: `2026-06-${day}T09:01:00.123456Z`,
      payloadTransform: (source) => buildApplicationV3FixturePayload(
        params.client, source) });
  await advanceV3Preflight(params.client, fixture, fixture.payload);
  return { fixture, interestId };
};

const sourceAuthorityId = async (client: PoolClient,
  payload: Readonly<Record<string, unknown>>,
  control: Exclude<RevocationControl, "interest">): Promise<string> => {
  const feedItemId = asV3Payload(payload).report.artifactPayload.citationMap[0]
    ?.feedItemId;
  if (feedItemId === undefined) throw new Error("V3 citation is missing");
  const row = (await client.query<{ readonly source_binding_id: string;
    readonly source_item_id: string; readonly id: string }>(
    "SELECT id::text, source_binding_id::text, source_item_id::text FROM feed_items WHERE id=$1::uuid",
    [feedItemId],
  )).rows[0];
  if (row === undefined) throw new Error("V3 race source binding is missing");
  return control === "source_binding" ? row.source_binding_id
    : control === "source_metadata" ? row.source_item_id : row.id;
};

const revocationSql = (control: Exclude<RevocationControl, "interest">): string =>
  control === "source_binding" ? "UPDATE source_bindings SET status='PAUSED'"
    : control === "feed_item" ? "UPDATE feed_items SET status='TOMBSTONED'"
      : "UPDATE source_items SET metadata=jsonb_set(metadata,'{deleted}','true'::jsonb)";

const waitForRowLock = async (client: PoolClient, pid: number): Promise<void> => {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const row = (await client.query<{ readonly waiting: boolean }>(
      `SELECT wait_event_type='Lock' AS waiting FROM pg_stat_activity WHERE pid=$1`,
      [pid],
    )).rows[0];
    if (row?.waiting) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("source-binding revocation did not wait on publication fence");
};

const cancelLocked = async (client: PoolClient,
  fixture: ReaderSummaryPublicationRunningFixture): Promise<number> => {
  const values = [fixture.jobId, payloadString(fixture, "tenantId"),
    payloadString(fixture, "workspaceId")];
  const rows = await client.query<{ readonly status: string;
    readonly published: boolean }>(`SELECT j.status::text,
      EXISTS (SELECT 1 FROM reader_summary_publications p
        WHERE p.reader_summary_job_id=j.id) AS published
    FROM reader_summary_jobs j WHERE j.id=$1 AND j.tenant_id=$2::uuid
      AND j.workspace_id=$3::uuid FOR UPDATE OF j`, values);
  if (rows.rows[0]?.status !== "RUNNING" || rows.rows[0].published) return 0;
  return (await client.query(`UPDATE reader_summary_jobs SET status='FAILED',
    failed_at=clock_timestamp(),failure_reason='Reader summary job cancelled by operator',
    terminal_failure_code='operator_cancelled' WHERE id=$1
      AND tenant_id=$2::uuid AND workspace_id=$3::uuid AND status='RUNNING'
    RETURNING id`, values)).rowCount ?? 0;
};

const cancelTransaction = async (client: PoolClient,
  fixture: ReaderSummaryPublicationRunningFixture): Promise<number> => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    try {
      const result = await cancelLocked(client, fixture);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      if ((error as { readonly code?: string }).code !== "40001" || attempt === 2) {
        throw error;
      }
    }
  }
  throw new Error("Operator cancellation retry exhausted");
};

const payloadString = (fixture: ReaderSummaryPublicationRunningFixture,
  key: string): string => {
  const value = fixture.payload[key];
  if (typeof value !== "string") throw new Error(`V3 fixture ${key} is missing`);
  return value;
};

const preparedV3Jobs = new Map<string, ReaderSummaryJob>();
const completedV3Jobs = new Map<string, ReaderSummaryJob>();
const completedV3Commands = new Map<string, ReaderSummaryPublicationCommand>();

const preflightFixture = async (params: Params, status: "COMPLETED" | "NO_SIGNAL",
  day: number): Promise<ReaderSummaryPublicationRunningFixture> => {
  const fixture = await params.createFixture(status, day,
    { publicationInterestId: randomUUID() });
  await advanceV3Preflight(params.client, fixture, fixture.payload);
  return fixture;
};

const advanceV3Preflight = async (client: PoolClient,
  fixture: ReaderSummaryPublicationRunningFixture,
  rawPayload: Readonly<Record<string, unknown>>) => {
  const payload = asV3Payload(rawPayload);
  const exactCutoff = payload.report.artifactPayload.promotionAttestations?.[0]
    ?.exactIngestionCutoff;
  await resetV3PreflightFixture(client, fixture.jobId, exactCutoff);
  const outcome = await runV3Preflight(client, fixture, payload);
  assert(outcome.kind === "claimed", "real V3 preflight did not claim ready job");
  return outcome;
};

const resetV3PreflightFixture = async (client: PoolClient, jobId: string,
  exactCutoff?: string, deadlineSeconds?: number) => {
  preparedV3Jobs.delete(jobId);
  completedV3Jobs.delete(jobId);
  completedV3Commands.delete(jobId);
  await client.query(`UPDATE reader_summary_jobs SET status='REQUESTED', started_at=NULL,
    completed_at=NULL, failed_at=NULL, reader_summary_artifact_id=NULL,
    failure_reason=NULL, terminal_failure_code=NULL,
    selection_strategy='jev_primary_v3', preparation_config=NULL,
    preparation_manifest=NULL, preparation_manifest_sha256=NULL,
    preparation_cutoff_at=COALESCE($2::timestamptz, requested_at),
    preparation_deadline_at=CASE WHEN $3::double precision IS NULL THEN NULL
      ELSE clock_timestamp()+make_interval(secs=>$3::double precision) END,
    preparation_next_check_at=NULL, preparation_ready_at=NULL
    WHERE id=$1::uuid`, [jobId, exactCutoff ?? null, deadlineSeconds ?? null]);
};

const runV3Preflight = async (client: PoolClient,
  fixture: ReaderSummaryPublicationRunningFixture, payload: V3FixturePayload) => {
  const prisma = postgresPreflightClient(client);
  const jobs = new PrismaReaderSummaryJobRepository(prisma);
  const job = await jobs.findById({ tenantId: tenantId(payload.tenantId),
    workspaceId: workspaceId(payload.workspaceId), readerSummaryJobId: fixture.jobId });
  if (job === null) throw new Error("V3 preflight fixture job is missing");
  const outcome = await new PrismaReaderSummaryV3Preflight(prisma, jobs,
    await postgresPreparationSource(client, payload))
    .advance({ job, requestedAt: job.toSnapshot().requestedAt,
      startedAt: job.toSnapshot().requestedAt });
  if (outcome.kind === "claimed" || outcome.kind === "already_running") {
    preparedV3Jobs.set(fixture.jobId, outcome.job);
    await pinPreparedAssessments(client, fixture.jobId, outcome.job);
  }
  return outcome;
};

const postgresPreparationSource = async (client: PoolClient,
  payload: V3FixturePayload): Promise<ReaderSummaryV3PreparationSourcePort> => {
  const interest = (await client.query<{ readonly query: string }>(
    "SELECT query FROM interests WHERE id=$1::uuid", [payload.interestId])).rows[0];
  if (interest === undefined) throw new Error("V3 preflight interest is missing");
  const config = { schemaVersion: "reader_summary_preparation_config.v1" as const,
    interestId: payload.interestId, interestSha256: sha256(interest.query),
    rubricVersion: "reader-value.v1", rubricSha256: "b".repeat(64),
    inputBuilderVersion: "input.v1", modelConfigVersion: "jev.v1" };
  const attestation = payload.report.artifactPayload.promotionAttestations?.[0];
  const citation = payload.report.artifactPayload.citationMap[0];
  const candidateId = citation?.feedItemId;
  const authority = attestation === undefined || candidateId === undefined ? undefined :
    (await client.query<{ readonly source_binding_id: string;
      readonly source_item_id: string; readonly provider_key: string;
      readonly published_at: string; readonly observed_at: string;
      readonly canonical_url: string }>(`SELECT f.source_binding_id::text,
        f.source_item_id::text, f.provider_key,
        to_char(f.published_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') published_at,
        to_char(f.observed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') observed_at,
        s.canonical_url FROM feed_items f JOIN source_items s
        ON s.tenant_id=f.tenant_id AND s.workspace_id=f.workspace_id AND s.id=f.source_item_id
        WHERE f.id=$1::uuid`, [candidateId])).rows[0];
  const candidates = attestation === undefined || candidateId === undefined || authority === undefined
    ? [] : [{ candidateId, sourceBindingId: authority.source_binding_id,
      providerKey: authority.provider_key, sourceItemId: authority.source_item_id,
      sourceRevisionKey: "publication-fixture",
      sourceSnapshotSha256: attestation.assessment.sourceSnapshotSha256,
      assessmentId: attestation.assessment.assessmentId,
      inputSha256: attestation.assessment.inputSha256,
      publishedAt: authority.published_at, observedAt: authority.observed_at,
      sourceKind: "article", canonicalIdentity: authority.canonical_url,
      storyId: attestation.storyId }];
  const manifest = { schemaVersion: "reader_summary_preparation_manifest.v1" as const,
    cutoffAt: attestation?.exactIngestionCutoff ?? payload.requestedAt,
    interestSha256: config.interestSha256,
    rubricSha256: config.rubricSha256, inputBuilderVersion: config.inputBuilderVersion,
    modelConfigVersion: config.modelConfigVersion, candidates };
  return {
    configuration: async () => ({ ok: true, config }),
    prepare: async () => ({ ok: true, config, manifest,
      manifestSha256: sha256(JSON.stringify(manifest)) }),
    coverage: async () => ({ status: "ready" }),
  };
};

const pinPreparedAssessments = async (client: PoolClient, jobId: string,
  job: ReaderSummaryJob): Promise<void> => {
  const ids = job.toSnapshot().preparationManifest?.candidates
    .map((candidate) => candidate.assessmentId) ?? [];
  if (ids.length === 0) return;
  await client.query(`UPDATE reader_value_assessments
    SET pinned_job_ids=array_append(pinned_job_ids,$1::uuid)
    WHERE id=ANY($2::uuid[]) AND NOT $1::uuid=ANY(pinned_job_ids)`, [jobId, ids]);
};

const assertPreflightCompetingHandlers = async (params: Params): Promise<void> => {
  const fixture = await params.createFixture("COMPLETED", 31,
    { publicationInterestId: randomUUID(), providerEvidence: "rss",
      payloadTransform: (source) => buildApplicationV3FixturePayload(params.client, source) });
  const payload = asV3Payload(fixture.payload);
  await resetV3PreflightFixture(params.client, fixture.jobId,
    payload.report.artifactPayload.promotionAttestations?.[0]?.exactIngestionCutoff);
  const outcomes = await Promise.all([
    runV3Preflight(params.client, fixture, payload),
    runV3Preflight(params.concurrentClient, fixture, payload),
  ]);
  assert(outcomes.filter((outcome) => outcome.kind === "claimed").length === 1 &&
    outcomes.every((outcome) => outcome.kind === "claimed" ||
      outcome.kind === "already_running"),
  `competing V3 preflight handlers returned ${outcomes.map((item) => item.kind)
    .join(",")} instead of one ready claim and one idempotent observation`);
  const row = (await params.client.query<{ readonly status: string;
    readonly preparation_manifest: unknown }>(`SELECT status::text, preparation_manifest
      FROM reader_summary_jobs WHERE id=$1::uuid`, [fixture.jobId])).rows[0];
  assert(row?.status === "RUNNING" && row.preparation_manifest !== null,
    "competing V3 preflight handlers did not durably hydrate one frozen manifest");
};

const assertProductionPreflightDeadlineLockOutcomes = async (params: Params) => {
  await assertLockedProductionAssessmentDeadline(params, 32, "on_time", "claimed");
  await assertLockedProductionAssessmentDeadline(params, 33, "late", "terminal");
};

const assertProductionPreflightHydration = async (params: Params): Promise<void> => {
  const interestId = randomUUID();
  const fixture = await params.createFixture("COMPLETED", 41, {
    publicationInterestId: interestId, providerEvidence: "rss",
    providerPublishedAt: "2026-07-11T09:00:00.123456Z",
    requestedAt: "2026-07-12T10:00:00.000Z",
  });
  await resetV3PreflightFixture(params.client, fixture.jobId);
  const feedItemId = asV3Payload(fixture.payload).report.artifactPayload.citationMap[0]?.feedItemId;
  if (feedItemId === undefined) throw new Error("production preflight fixture citation is missing");
  await seedProductionReaderValueCapture(params.client, feedItemId);
  const scope = { tenantId: payloadString(fixture, "tenantId"),
    workspaceId: payloadString(fixture, "workspaceId"), jobId: fixture.jobId };
  const pending = await runProductionV3Preflight(params.client, scope);
  assert(pending.kind === "deferred", "production V3 source must persist a pending manifest");
  await completeProductionV3Assessment({ ...scope, client: params.client,
    lockClient: params.concurrentClient, answers: fixtureReaderValueAnswers(),
    timing: "on_time" });
  const outcomes = await Promise.all([runProductionV3Preflight(params.client, scope),
    runProductionV3Preflight(params.concurrentClient, scope)]);
  assert(outcomes.filter((outcome) => outcome.kind === "claimed").length === 1 &&
    outcomes.every((outcome) => outcome.kind === "claimed" ||
      outcome.kind === "already_running"),
  "production V3 source must make one ready claim after persisted readiness");
  const hydrated = await new PrismaReaderSummaryJobRepository(postgresPreflightClient(params.client))
    .findById({ tenantId: tenantId(scope.tenantId), workspaceId: workspaceId(scope.workspaceId),
      readerSummaryJobId: scope.jobId });
  assert(hydrated?.toSnapshot().preparationManifest?.candidates.length === 1 &&
    hydrated.toSnapshot().preparationCutoffAt?.endsWith("000000Z") === true,
  "production preflight repository hydration lost frozen SQL preparation");
};

const assertLockedProductionAssessmentDeadline = async (params: Params, day: number,
  timing: "on_time" | "late", expected: "claimed" | "terminal"): Promise<void> => {
  const fixture = await params.createFixture("COMPLETED", day,
    { publicationInterestId: randomUUID(), providerEvidence: "rss",
      providerPublishedAt: day === 32 ? "2026-07-02T09:00:00.123456Z"
        : "2026-07-03T09:00:00.123456Z",
      providerObservedAt: day === 32 ? "2026-07-02T09:01:00.123456Z"
        : "2026-07-03T09:01:00.123456Z",
      requestedAt: day === 32 ? "2026-07-03T10:00:00.123456Z"
        : "2026-07-04T10:00:00.123456Z" });
  await resetV3PreflightFixture(params.client, fixture.jobId, undefined,
    timing === "late" ? 1 : 300);
  const feedItemId = asV3Payload(fixture.payload).report.artifactPayload.citationMap[0]?.feedItemId;
  if (feedItemId === undefined) throw new Error("production deadline fixture citation is missing");
  await seedProductionReaderValueCapture(params.client, feedItemId);
  const scope = { tenantId: payloadString(fixture, "tenantId"),
    workspaceId: payloadString(fixture, "workspaceId"), jobId: fixture.jobId };
  const initial = await runProductionV3Preflight(params.client, scope);
  assert(initial.kind === "deferred", `deadline got ${initial.kind}/${initial.job.toSnapshot().preparationManifest?.candidates.length ?? "none"}`);
  await completeProductionV3Assessment({ ...scope, client: params.client,
    lockClient: params.concurrentClient, answers: fixtureReaderValueAnswers(), timing });
  const outcome = await runProductionV3Preflight(params.client, scope);
  assert(outcome.kind === expected,
    `assessment completed ${timing} through claim/authorize/complete must ${expected}`);
  if (expected === "terminal") await assertTerminalFailureCode(params.client,
    fixture.jobId, "assessment_coverage_timeout");
};

const assertMicrosecondCutoff = async (client: PoolClient, jobId: string,
  payload: V3FixturePayload) => {
  const exactCutoff = payload.report.artifactPayload.promotionAttestations?.[0]
    ?.exactIngestionCutoff;
  assert(exactCutoff !== undefined, "V3 exact preparation cutoff is missing");
  assert(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(payload.requestedAt) &&
    new Date(payload.requestedAt).toISOString() === payload.requestedAt &&
    payload.exactProof.requestedAt === payload.requestedAt,
  "V3 outer requestedAt is not canonical JS-Date precision");
  const hydrated = await new PrismaReaderSummaryJobRepository(
    postgresPreflightClient(client)).findById({ tenantId: tenantId(payload.tenantId),
    workspaceId: workspaceId(payload.workspaceId), readerSummaryJobId: jobId });
  assert(hydrated?.toSnapshot().preparationCutoffAt === exactCutoff,
    "repository hydration lost the six-digit V3 preparation cutoff");
  const row = (await client.query<{ readonly cutoff: string;
    readonly requested_at: string; readonly manifest_cutoff: string;
    readonly included: string }>(`
    SELECT to_char(preparation_cutoff_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cutoff,
      to_char(requested_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS requested_at,
      preparation_manifest->>'cutoffAt' AS manifest_cutoff,
      (SELECT string_agg(value, ',' ORDER BY value) FROM (VALUES
        ('exact', $2::timestamptz),
        ('plus-one', $2::timestamptz + interval '1 microsecond')
      ) boundary(value, observed_at)
      WHERE observed_at <= preparation_cutoff_at) AS included
    FROM reader_summary_jobs WHERE id=$1::uuid`, [jobId, exactCutoff])).rows[0];
  assert(row?.requested_at === payload.requestedAt && row.cutoff === exactCutoff &&
    row.manifest_cutoff === row.cutoff && row.included === "exact",
  "V3 envelope/cutoff precision diverged or cutoff +1us was admitted");
};

const assertApplicationPayloadRoundTrip = async (client: PoolClient,
  fixture: ReaderSummaryPublicationRunningFixture,
  rawPayload: Readonly<Record<string, unknown>>) => {
  const payload = asV3Payload(rawPayload);
  const rows = await client.query<{ readonly artifact_payload: V3ArtifactPayload }>(
    "SELECT artifact_payload FROM reader_summary_artifacts WHERE id=$1", [fixture.artifactId]);
  const expected = payload.report.artifactPayload.promotionAttestations;
  assert(stableJson(rows.rows[0]?.artifact_payload?.promotionAttestations) ===
    stableJson(expected), "application-shaped V3 attestation did not round-trip");
  assert(rows.rows[0]?.artifact_payload?.content?.topReads?.[0]?.exactPublishedAt ===
    "2026-06-14T09:00:00.123456Z",
  "V3 card publication timestamp lost PostgreSQL microseconds");
  const persistedAttestation = rows.rows[0]?.artifact_payload?.promotionAttestations?.[0];
  assert(persistedAttestation?.publishedAt === "2026-06-14T09:00:00.123456Z" &&
    persistedAttestation.assessment.assessedAt === "2026-06-14T09:01:00.123456Z" &&
    persistedAttestation.exactIngestionCutoff === "2026-06-14T10:00:00.123456Z",
  "V3 provider timestamps or attestation cutoff lost PostgreSQL microseconds");
  const record = (await client.query<PrismaReaderSummaryArtifactRecord>(`SELECT id::text AS "id",
    tenant_id::text AS "tenantId", workspace_id::text AS "workspaceId", scope_type AS "scopeType",
    scope_key AS "scopeKey", interest_id::text AS "interestId", cadence::text AS "cadence",
    period_started_at AS "periodStartedAt", period_ended_at AS "periodEndedAt", period_timezone AS "periodTimezone",
    period_key AS "periodKey", user_id::text AS "userId", subscription_id::text AS "subscriptionId",
    status::text AS "status", schema_version AS "schemaVersion", model_version AS "modelVersion",
    prompt_version AS "promptVersion", headline AS "headline", summary_text AS "summaryText",
    artifact_payload AS "artifactPayload", citations AS "citations", quality_signals AS "qualitySignals",
    created_at AS "createdAt", updated_at AS "updatedAt" FROM reader_summary_artifacts WHERE id=$1::uuid`,
  [fixture.artifactId])).rows[0];
  if (record === undefined) throw new Error("V3 persisted artifact is missing");
  const rest = readerSummaryArtifactViewFromReaderSummaryView(presentReaderSummaryArtifact(
    readerSummaryArtifactFromPrisma(record), { status: "fresh", checkedAt: new Date(payload.requestedAt) }));
  const transport = JSON.parse(JSON.stringify(rest)) as typeof rest;
  assert(transport.readerBrief.topReads[0]?.promotionAttestation?.exactIngestionCutoff ===
    "2026-06-14T10:00:00.123456Z" &&
    transport.readerBrief.topReads[0]?.promotionAttestation?.canonicalPayload !== undefined,
  "production persistence parser/REST mapper did not emit serializable V3 transport");
  assertFlutterV3FixtureFresh(transport);
};

export const buildApplicationV3FixturePayload = async (client: PoolClient,
  source: Readonly<Record<string, unknown>>) => {
  const payload = JSON.parse(JSON.stringify(source)) as V3FixturePayload;
  const baseArtifact = payload.report.artifactPayload;
  const citation = baseArtifact.citationMap[0] as Record<string, string>;
  const candidateId = citation.feedItemId;
  const sourceItemId = citation.sourceItemId;
  const citationId = citation.citationId;
  if (candidateId === undefined || sourceItemId === undefined ||
      citationId === undefined) throw new Error("V3 fixture citation is incomplete");

  const authority = (await client.query<{ readonly source_binding_id: string;
    readonly interest_id: string; readonly provider_key: string;
    readonly title: string; readonly body: string;
    readonly published_at: string; readonly observed_at: string;
    readonly canonical_url: string; readonly trusted_intent: string }>(
    `SELECT f.source_binding_id::text, f.interest_id::text, f.provider_key,
      f.title, COALESCE(s.body, f.body_preview, '') AS body,
      to_char(f.published_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') published_at,
      to_char(f.observed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') observed_at,
      f.canonical_url, i.query AS trusted_intent
    FROM feed_items f JOIN source_items s
      ON s.tenant_id=f.tenant_id AND s.workspace_id=f.workspace_id
      AND s.id=f.source_item_id
    JOIN interests i ON i.tenant_id=f.tenant_id AND i.workspace_id=f.workspace_id
      AND i.id=f.interest_id WHERE f.id=$1::uuid`, [candidateId])).rows[0];
  if (authority === undefined || authority.interest_id !== payload.interestId ||
      authority.provider_key !== "rss") {
    throw new Error("V3 fixture source authority is incomplete");
  }
  const title = authority.title;
  const sourceText = authority.body;
  const input = { tenantId: payload.tenantId, workspaceId: payload.workspaceId,
    interestId: authority.interest_id, candidateId,
    sourceItemId, sourceBindingId: authority.source_binding_id,
    providerKey: authority.provider_key, trustedIntent: authority.trusted_intent,
    sourceSnapshotSha256: "1".repeat(64), title, body: sourceText,
    captureComplete: true };
  const quote = title;
  const headline = { status: "accepted" as const, kind: "claim" as const,
    text: title, binding: { candidateId: input.candidateId,
      providerKey: input.providerKey, tenantId: input.tenantId,
      workspaceId: input.workspaceId, interestId: input.interestId,
      sourceBindingId: input.sourceBindingId, sourceItemId: input.sourceItemId,
      trustedIntent: input.trustedIntent, availability: "body_present" as const,
      reviewedInputDigest: promotionPayloadDigest(JSON.stringify({
        candidateId: input.candidateId, providerKey: input.providerKey,
        context: { tenantId: input.tenantId, workspaceId: input.workspaceId,
          interestId: input.interestId, sourceBindingId: input.sourceBindingId,
          sourceItemId: input.sourceItemId, trustedIntent: input.trustedIntent,
          availability: "body_present" }, title, body: sourceText })) },
    support: [{ field: "title" as const, start: 0, end: quote.length,
      quote }], qualifications: [], confidence: 0.9,
    wholeInput: { titleLength: title.length, bodyLength: sourceText.length,
      qualificationJudgment: "none" as const } };
  const presentation = sealReaderPostPresentationV3({ input, headline });
  if (presentation.status !== "available") throw new Error("Invalid V3 fixture");
  const candidate: ReaderPostPromotionV3Candidate = { candidateId,
    providerKey: authority.provider_key, providerFamily: "rss",
    sourceItemId, canonicalIdentity: authority.canonical_url,
    storyId: "story-v3", publishedAt: authority.published_at,
    assessmentId: randomUUID(), assessedAt: authority.observed_at,
    rubricVersion: "reader-value.v1",
    sourceSnapshotSha256: input.sourceSnapshotSha256, inputSha256: "2".repeat(64),
    rubricSha256: "b".repeat(64), modelConfigVersion: "jev.v1",
    answers: fixtureReaderValueAnswers(), presentation: {
      status: "available" as const,
      presentationInputDigest: presentation.presentationInputDigest },
    scopeValid: true, sourceIdentityValid: true, freshnessValid: true,
    safetyValid: true, citationValid: true, blocked: false };
  const assessmentSnapshot = {
    sourceSnapshotSha256: candidate.sourceSnapshotSha256,
    interestSha256: sha256(authority.trusted_intent),
    sanitizedTextSha256: sha256(`${title}\n${sourceText}`),
    title, body: sourceText, interest: authority.trusted_intent,
    capture: { representationVersion: "capture.v1", availability: "complete",
      segments: [] },
    availableAt: candidate.publishedAt, originalTitleLength: title.length,
    originalBodyLength: sourceText.length, retainedSnapshotTruncated: false,
    safety: "allowed",
  };
  await client.query(`INSERT INTO reader_value_assessments(
      id,tenant_id,workspace_id,interest_id,source_item_id,source_revision_key,
      source_snapshot_sha256,interest_sha256,rubric_version,rubric_sha256,
      input_builder_version,model_config_version,input_sha256,request_sha256,
      input_snapshot,request_body,state,attempts,attempt_history,next_attempt_at,
      usefulness,relevance,context_sufficiency,evidence_basis,result,
      requested_model,resolved_model,provider,assessed_at,expires_at)
    VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,'publication-fixture',
      $6,$7,$8,$9,'input.v1',$10,$11,$12,$13::jsonb,'{}','assessed',0,'[]',
      clock_timestamp(),$14,$15,$16,$17,$18::jsonb,'fixture-model','fixture-model',
      'fixture',$19::timestamptz,CURRENT_TIMESTAMP+interval '180 days')`, [
    candidate.assessmentId, payload.tenantId, payload.workspaceId,
    authority.interest_id, sourceItemId, candidate.sourceSnapshotSha256,
    assessmentSnapshot.interestSha256, candidate.rubricVersion,
    candidate.rubricSha256, candidate.modelConfigVersion, candidate.inputSha256,
    sha256("{}"), JSON.stringify(assessmentSnapshot),
    candidate.answers.usefulness.choice, candidate.answers.relevance.choice,
    candidate.answers.context_sufficiency.choice,
    candidate.answers.evidence_basis.choice, JSON.stringify(candidate.answers),
    candidate.assessedAt,
  ]);
  const promotionV3 = selectReaderPostPromotionsV3([candidate]);
  assert(promotionV3.outcome === "ready", "V3 fixture candidate was not admitted");
  const exactIngestionCutoff = `${candidate.publishedAt.slice(0, 10)}T10:00:00.123456Z`;
  const sourceWindow = { windowId: "v3-window",
    startedAt: new Date(payload.periodStartedAt),
    endedAt: new Date(payload.periodEndedAt),
    selectedFeedItemIds: [candidate.candidateId], storyClusterIds: [candidate.storyId],
    periodStartedAt: new Date(payload.periodStartedAt),
    periodEndedAt: new Date(payload.periodEndedAt),
    ingestionCutoff: new Date(exactIngestionCutoff), exactIngestionCutoff };
  const evidenceItem = { readerHeadline: presentation.seal.headline,
    feedItemId: candidateId, sourceItemId,
    sourceBindingId: authority.source_binding_id,
    interestId: authority.interest_id, providerKey: "rss" as const,
    canonicalUrl: authority.canonical_url, title, bodyPreview: sourceText,
    sourceText, publishedAt: new Date(candidate.publishedAt),
    observedAt: new Date(candidate.assessedAt), score: 0, whyImportant: [],
    readerActionKind: "read_source" as const, storyKeyHint: candidate.storyId };
  const cluster = { id: candidate.storyId, storyKey: candidate.storyId,
    rankingPolicyVersion: "reader_promotion_policy.v3",
    representativeFeedItemId: candidateId, duplicateFeedItemIds: [],
    interestIds: [authority.interest_id], providerKeys: ["rss"], score: 0,
    observedAtRange: { startedAt: new Date(candidate.assessedAt),
      endedAt: new Date(candidate.assessedAt) }, whyImportant: [] };
  const artifactCitation = { citationId, feedItemId: candidateId, sourceItemId,
    providerKey: "rss", field: "title" as const,
    canonicalUrl: authority.canonical_url };
  const evidence: SummaryEvidenceSelection = {
    rankingPolicyVersion: "reader_promotion_policy.v3", sourceWindow,
    clusters: [cluster], selectedEvidence: [evidenceItem], promotionV3 };
  const draft = { headline: title, executiveSummary: sourceText,
    topStories: [{ storyClusterId: candidate.storyId, title,
      summary: sourceText, interestIds: [authority.interest_id],
      providerKeys: ["rss"], citationIds: [citationId] }],
    interestHighlights: [], repeatedSignals: [], risksAndUnknowns: [],
    citationMap: [artifactCitation], qualityFlags: [],
    confidence: { level: "high" as const, score: 0.9,
      rationale: "Validated V3 fixture evidence." },
    lineage: { schemaVersion: "reader_summary.artifact.v1" as const,
      modelVersion: payload.modelVersion,
      providerVersion: "reader-summary.provider.pg-gate.v1",
      promptVersion: payload.report.promptVersion,
      rulesVersion: "reader-summary.rules.pg-gate.v1",
      evalDatasetVersion: "reader-summary.eval.pg-gate.v1",
      rankingPolicyVersion: "reader_promotion_policy.v3" },
    usage: { inputTokens: 1, outputTokens: 1, estimatedCostUsd: 0 } };
  const draftWithContent = buildReaderSummaryDraftWithPromotionContent(evidence, draft);
  const applicationArtifact = ReaderSummaryArtifact.create({
    schemaVersion: "reader_summary.artifact.v1",
    readerSummaryId: payload.readerSummaryArtifactId,
    tenantId: tenantId(payload.tenantId), workspaceId: workspaceId(payload.workspaceId),
    scope: { type: "interest", interestId: authority.interest_id },
    period: { cadence: "daily", startedAt: new Date(payload.periodStartedAt),
      endedAt: new Date(payload.periodEndedAt), timezone: payload.periodTimezone,
      periodKey: payload.periodKey }, generatedAt: new Date(payload.requestedAt),
    sourceWindow, storyClusters: [cluster], contextArtifacts: [],
    ...draftWithContent,
    ...buildReaderSummaryPromotionArtifactFields({
      artifactId: payload.readerSummaryArtifactId,
      modelEvidence: evidence, draft: draftWithContent }),
  });
  const artifact = serializeReaderSummaryArtifact(applicationArtifact);
  const snapshot = applicationArtifact.toSnapshot();
  payload.report.headline = snapshot.headline;
  payload.report.summaryText = snapshot.executiveSummary;
  payload.report.artifactPayload = artifact as V3ArtifactPayload;
  payload.report.citations = snapshot.citationMap;
  const view = presentReaderSummaryArtifact(applicationArtifact,
    { status: "fresh", checkedAt: new Date(payload.requestedAt) });
  const rest = readerSummaryArtifactViewFromReaderSummaryView(view);
  const card = view.content.topReads[0];
  const attestation = view.promotionAttestations[0];
  assert(card !== undefined && attestation !== undefined &&
    validReaderDisplayRestBinding(card, attestation, view),
  "application-built V3 artifact failed the REST display binding");
  assert(attestation.ingestionCutoff === new Date(exactIngestionCutoff).toISOString() &&
    attestation.exactIngestionCutoff === exactIngestionCutoff,
  "application-shaped V3 attestation lost the exact cutoff");
  assert(rest.readerBrief.topReads[0]?.publishedAt === candidate.publishedAt &&
    rest.readerBrief.topReads[0]?.title === headline.text,
  "application-built V3 artifact lost REST/client timestamp or headline parity");
  assert(!JSON.stringify({ rest, attestation }).includes(authority.trusted_intent) &&
    JSON.stringify(attestation).includes("interestDigest"),
  "SQL-read V3 public REST payload exposed private interest text");
  const reportCanonical = stableJson(payload.report);
  const reportSha256 = sha256(reportCanonical);
  payload.reportCanonical = reportCanonical;
  payload.reportSha256 = reportSha256;
  payload.exactProof.reportSha256 = reportSha256;
  const proofCanonical = stableJson(payload.exactProof);
  payload.proofCanonical = proofCanonical;
  payload.proofSha256 = sha256(proofCanonical);
  return { payload, applicationArtifact };
};

const publishThroughApplicationGuard = async (params: Params,
  fixture: ReaderSummaryPublicationRunningFixture,
  rawPayload: Readonly<Record<string, unknown>>,
  expectArtifactParity = true): Promise<string> => {
  const payload = asV3Payload(rawPayload);
  const artifact = fixture.applicationArtifact;
  if (artifact === undefined) {
    throw new Error("V3 application artifact is missing from the fixture");
  }
  if (expectArtifactParity) {
    assert(stableJson(serializeReaderSummaryArtifact(artifact)) ===
      stableJson(payload.report.artifactPayload),
    "application guard artifact differs from the persisted publication artifact");
  }
  return publishThroughProductionEquivalentGuard(params.client, fixture,
    payload, params.publish);
};

const publishThroughProductionEquivalentGuard = async (client: PoolClient,
  fixture: ReaderSummaryPublicationRunningFixture,
  rawPayload: Readonly<Record<string, unknown>>,
  publish: Params["publish"],
  artifact: ReaderSummaryArtifact | undefined = fixture.applicationArtifact,
): Promise<string> => {
  const payload = asV3Payload(rawPayload);
  const result = await withPrismaWriteRetry(async () => {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    try {
      const guard = await readerSummaryV3PublicationGuard(taggedSqlClient(client),
        applicationGuardCommand(fixture, artifact));
      if (guard !== undefined && guard.allowed === false) {
        await client.query("COMMIT");
        return { guard } as const;
      }
      const outcome = await publish(client, payload);
      await client.query("COMMIT");
      return { outcome } as const;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
  if ("guard" in result && result.guard !== undefined) {
    throw new Error(`V3 application publication guard rejected: ${result.guard.reason}`);
  }
  return result.outcome;
};

const applicationGuardCommand = (
  fixture: ReaderSummaryPublicationRunningFixture,
  artifactOverride: ReaderSummaryArtifact | undefined = fixture.applicationArtifact,
): ReaderSummaryPublicationCommand => {
  const artifact = artifactOverride;
  if (artifact === undefined) throw new Error("V3 application artifact is missing");
  const retained = completedV3Commands.get(fixture.jobId);
  if (retained !== undefined && artifact === fixture.applicationArtifact) return retained;
  const prepared = preparedV3Jobs.get(fixture.jobId);
  if (prepared === undefined) throw new Error("V3 prepared job is missing");
  let finalJob = completedV3Jobs.get(fixture.jobId);
  if (finalJob === undefined) {
    finalJob = prepared.complete({ completedAt: new Date(),
      readerSummaryId: fixture.artifactId });
    completedV3Jobs.set(fixture.jobId, finalJob);
  }
  const command = { finalJob, artifact } as unknown as ReaderSummaryPublicationCommand;
  if (artifact === fixture.applicationArtifact) {
    completedV3Commands.set(fixture.jobId, command);
  }
  return command;
};

const asV3Payload = (
  payload: Readonly<Record<string, unknown>>,
): V3FixturePayload => payload as V3FixturePayload;

const taggedSqlClient = (client: PoolClient): PrismaReaderSummaryClient => ({
  $queryRaw: async <T>(parts: TemplateStringsArray, ...values: readonly unknown[]) => {
    const text = parts.reduce((sql, part, index) =>
      `${sql}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    return (await client.query(text, [...values])).rows as T;
  },
} as PrismaReaderSummaryClient);

const assertCounts = async (client: PoolClient,
  fixture: ReaderSummaryPublicationRunningFixture, publications: number, outbox: number) => {
  const rows = await client.query<{ publications: string; outbox: string }>(
    `SELECT (SELECT count(*) FROM reader_summary_publications
      WHERE reader_summary_job_id=$1) publications,
      (SELECT count(*) FROM outbox_events WHERE correlation_id=$1::text) outbox`,
    [fixture.jobId]);
  assert(rows.rows[0]?.publications === String(publications) &&
    rows.rows[0]?.outbox === String(outbox), "publication/outbox count mismatch");
};

const assertTerminalRejection = async (client: PoolClient,
  fixture: ReaderSummaryPublicationRunningFixture,
  expectedCode: "scope_changed" | "interest_changed"): Promise<void> => {
  const row = (await client.query<{ readonly status: string;
    readonly terminal_failure_code: string | null;
    readonly failure_reason: string | null; readonly failed_at: Date | null }>(
    `SELECT status::text, terminal_failure_code, failure_reason, failed_at
      FROM reader_summary_jobs WHERE tenant_id=$1::uuid
        AND workspace_id=$2::uuid AND id=$3::uuid`, [
      payloadString(fixture, "tenantId"), payloadString(fixture, "workspaceId"),
      fixture.jobId,
    ])).rows[0];
  assert(row?.status === "FAILED" && row.terminal_failure_code === expectedCode &&
    row.failure_reason === expectedCode && row.failed_at instanceof Date,
  `V3 rejection was not durably terminalized as ${expectedCode}`);
};

const assertTerminalFailureCode = async (client: PoolClient, jobId: string,
  code: string): Promise<void> => {
  const row = (await client.query<{ readonly status: string;
    readonly terminal_failure_code: string | null }>(`SELECT status::text,
      terminal_failure_code FROM reader_summary_jobs WHERE id=$1::uuid`, [jobId])).rows[0];
  assert(row?.status === "FAILED" && row.terminal_failure_code === code,
    `real V3 preflight did not fail closed as ${code}`);
};
