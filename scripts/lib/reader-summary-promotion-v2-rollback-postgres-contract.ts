import type { PoolClient } from "pg";

import {
  readerSummaryPublicationFixtureScope,
  setReaderSummaryPublicationSessionScope,
} from "./reader-summary-publication-postgres-fixture-scope";
import {
  assertPostgres as assert,
  assertPostgresRejectsContaining as assertRejectsContaining,
} from "./reader-summary-publication-postgres-assertions";
import type { ReaderSummaryPublicationRunningFixture } from
  "./reader-summary-publication-postgres-running-fixture";
import { verifyHistoricalPromotionArtifact } from
  "./reader-summary-promotion-v2-historical-artifact";
import { preparePromotionRollbackLifecycleFixture } from
  "./reader-summary-promotion-v2-rollback-lifecycle-fixture";
import {
  readerSummaryPublicationDbOwnedRequest,
  type EvidenceFixtureOverrides,
} from "./reader-summary-weekly-publication-evidence-postgres-contract";

type ContractInput = Readonly<{
  adminClient: PoolClient;
  auditorClient: PoolClient;
  runtimeClient: PoolClient;
  runtimeRole: string;
  createFixture: (
    status: "COMPLETED" | "NO_SIGNAL",
    day: number | string,
    overrides?: EvidenceFixtureOverrides & Readonly<{
      requestedAt?: string;
      modelVersion?: string;
    }>,
  ) => Promise<ReaderSummaryPublicationRunningFixture>;
  publish: (payload: Readonly<Record<string, unknown>>) => Promise<string>;
}>;

type PublicationTuple = Readonly<{
  publicationId: string;
  artifactId: string;
  reportSha256: string;
  proofSha256: string;
}>;

const day = "2026-06-20";
const wrongDay = "2026-06-22";
const startedAt = `${day}T00:00:00.000Z`;
const endedAt = "2026-06-21T00:00:00.000Z";
const fenceToken = `reader-summary-date:${day}:1`;
const canaryFormat =
  "reader-summary-promotion-v2-canary-publication-receipt-v1";

export const assertReaderSummaryPromotionV2RollbackPostgresContract = async (
  input: ContractInput,
): Promise<void> => {
  const v1 = await publishedPromotionFixture(input, day, "v1", 9);
  const v2 = await publishedPromotionFixture(input, day, "v2", 12);
  const before = await lifecycle(input.auditorClient, v1, v2);
  assert(before.v1_status === "SUPERSEDED" &&
    before.v2_status === "COMPLETED" &&
    before.active_publication_id === v2.publicationId,
  "real V2 publication must supersede the prior V1 artifact");

  const canary = await canaryReceipt(input.runtimeClient, v2.publicationId);
  assert(canary.format === canaryFormat &&
    canary.rollbackAuthority.priorPublicationId === v1.publicationId &&
    canary.rollbackAuthority.expectedCurrentPublicationId === v2.publicationId,
  "real publisher must record the exact replaced V1 canary authority");

  const wrongV1 = await publishedPromotionFixture(
    input,
    wrongDay,
    "v1",
    9,
  );
  const wrongV2 = await publishedPromotionFixture(
    input,
    wrongDay,
    "v2",
    12,
  );
  const wrongCanary = await canaryReceipt(
    input.runtimeClient,
    wrongV2.publicationId,
    wrongDay,
  );
  const call = (options: Readonly<{
    receiptSha256?: string;
    prior?: PublicationTuple;
  }> = {}) => rollback(input.runtimeClient, {
    current: v2,
    prior: options.prior ?? v1,
    receiptSha256: options.receiptSha256 ?? canary.receiptSha256,
  });

  await assertRejectsContaining(
    () => rollback(input.runtimeClient, {
      current: wrongV2,
      prior: wrongV1,
      receiptSha256: wrongCanary.receiptSha256,
    }),
    "active publication is stale",
    "a valid receipt for another slot must be stale for the target slot",
  );
  await assertRejectsContaining(
    () => call({ receiptSha256: "f".repeat(64) }),
    "canary publication receipt mismatch",
    "a tampered canary receipt hash must fail closed",
  );
  await assertRejectsContaining(
    () => call({ prior: wrongV1 }),
    "publication slot/proof mismatch",
    "a prior V1 tuple from another slot must fail closed",
  );
  const afterRefusals = await lifecycle(input.auditorClient, v1, v2);
  assert(afterRefusals.v1_status === "SUPERSEDED" &&
    afterRefusals.v2_status === "COMPLETED" &&
    afterRefusals.active_publication_id === v2.publicationId,
  "tamper and wrong-slot refusal must leave the V2 lifecycle unchanged");

  const result = await call();
  assert(result.rows.length === 1, "rollback must return its durable receipt");
  await assertRejectsContaining(
    call,
    "stale or replayed",
    "the same canary authority receipt must not be replayable",
  );

  const after = await lifecycle(input.auditorClient, v1, v2);
  assert(after.active_publication_id === v1.publicationId &&
    after.v1_status === "COMPLETED" && after.v2_status === "SUPERSEDED" &&
    after.artifact_count === "2" && after.publication_count === "2" &&
    after.rollback_receipt_count === "1" && after.canary_receipt_count === "1",
  "rollback must restore V1 and supersede V2 while preserving both ledgers");
  const [restoredV1, preservedV2] = await Promise.all([
    publicationTuple(input.auditorClient, v1.publicationId),
    publicationTuple(input.auditorClient, v2.publicationId),
  ]);
  assert(samePublicationTuple(restoredV1, v1) &&
    samePublicationTuple(preservedV2, v2) &&
    after.v1_payload_sha256 === before.v1_payload_sha256 &&
    after.v2_payload_sha256 === before.v2_payload_sha256,
  "rollback must preserve both publication proofs and artifact payloads");

  const restored = await legacyReaderPublication(
    input.runtimeClient,
    v1.publicationId,
  );
  assert(verifyHistoricalPromotionArtifact(restored).kind === "strict-v1",
    "the actual legacy V1 reader must consume the restored active artifact");

  await grantFixtureReceiptRead(input.adminClient, input.runtimeRole);
  await setReaderSummaryPublicationSessionScope(input.runtimeClient);
  const visible = await receiptCounts(input.runtimeClient);
  await setReaderSummaryPublicationSessionScope(input.runtimeClient, {
    tenantId: readerSummaryPublicationFixtureScope.tenantId,
    workspaceId: "00000000-0000-7000-8000-000000000099",
  });
  const hidden = await receiptCounts(input.runtimeClient);
  assert(visible.rollback === "1" && visible.canary === "2" &&
    hidden.rollback === "0" && hidden.canary === "0",
  "canary and rollback receipts must be tenant/workspace isolated");

  await assertRejectsContaining(
    () => input.auditorClient.query(`UPDATE
      reader_summary_promotion_v2_rollback_receipts
      SET rolled_back_at=rolled_back_at WHERE authority_receipt_sha256=$1`,
    [canary.receiptSha256]),
    "rollback receipts are immutable",
    "rollback receipt updates must be rejected",
  );
  await assertRejectsContaining(
    () => input.auditorClient.query(`DELETE FROM
      reader_summary_promotion_v2_canary_publication_receipts
      WHERE receipt_sha256=$1`, [canary.receiptSha256]),
    "rollback receipts are immutable",
    "canary receipt deletes must be rejected",
  );
};

const publishedPromotionFixture = async (
  input: ContractInput,
  date: string,
  version: "v1" | "v2",
  requestedHour: number,
): Promise<PublicationTuple> => {
  const fixture = await input.createFixture("COMPLETED", date, {
    providerEvidence: "reddit",
    requestedAt: `${date}T${String(requestedHour).padStart(2, "0")}:00:00.000Z`,
  });
  await preparePromotionRollbackLifecycleFixture(
    input.runtimeClient,
    fixture,
    version,
  );
  assert(await input.publish(readerSummaryPublicationDbOwnedRequest(fixture)) ===
    "published", `real ${version.toUpperCase()} publication must succeed`);
  return publicationTuple(input.runtimeClient, fixture.artifactId);
};

const publicationTuple = async (
  client: PoolClient,
  publicationId: string,
): Promise<PublicationTuple> => {
  const result = await client.query<{
    publication_id: string;
    artifact_id: string;
    report_sha256: string;
    proof_sha256: string;
  }>(`SELECT id::text AS publication_id,
    reader_summary_artifact_id::text AS artifact_id,
    btrim(report_sha256) AS report_sha256,
    btrim(proof_sha256) AS proof_sha256
    FROM reader_summary_publications WHERE id=$1::uuid`, [publicationId]);
  const row = result.rows[0];
  if (row === undefined) throw new Error("Published fixture tuple is missing");
  return {
    publicationId: row.publication_id,
    artifactId: row.artifact_id,
    reportSha256: row.report_sha256,
    proofSha256: row.proof_sha256,
  };
};

const samePublicationTuple = (
  actual: PublicationTuple,
  expected: PublicationTuple,
): boolean => actual.publicationId === expected.publicationId &&
  actual.artifactId === expected.artifactId &&
  actual.reportSha256 === expected.reportSha256 &&
  actual.proofSha256 === expected.proofSha256;

const canaryReceipt = async (
  client: PoolClient,
  publicationId: string,
  requestedDate = day,
): Promise<{
  format: string;
  receiptSha256: string;
  rollbackAuthority: {
    priorPublicationId: string;
    expectedCurrentPublicationId: string;
  };
}> => {
  await client.query(
    "SELECT set_config('social_monitor.system_access', 'true', false)",
  );
  const result = await client.query<{ receipt: {
    format: string;
    receiptSha256: string;
    rollbackAuthority: {
      priorPublicationId: string;
      expectedCurrentPublicationId: string;
    };
  } }>(`SELECT public."reader_summary_promotion_v2_canary_receipt"(
    $1::uuid,$2::uuid,$3::date,$4::uuid
  ) AS receipt`, [
    readerSummaryPublicationFixtureScope.tenantId,
    readerSummaryPublicationFixtureScope.workspaceId,
    requestedDate,
    publicationId,
  ]);
  const receipt = result.rows[0]?.receipt;
  if (receipt === undefined) throw new Error("Canary receipt is missing");
  return receipt;
};

const rollback = (
  client: PoolClient,
  input: Readonly<{
    current: PublicationTuple;
    prior: PublicationTuple;
    receiptSha256: string;
  }>,
) => client.query<{ receipt: unknown }>(`
  SELECT public."rollback_reader_summary_promotion_v2"(
    $1::uuid,$2::uuid,$3::date,$4::text,$5::text,$6::uuid,$7::uuid,
    $8::text,$9::text,$10::uuid,$11::uuid,$12::text,$13::text,$14::text,
    $15::timestamptz
  ) AS receipt
`, [
  readerSummaryPublicationFixtureScope.tenantId,
  readerSummaryPublicationFixtureScope.workspaceId,
  day,
  canaryFormat,
  input.receiptSha256,
  input.current.publicationId,
  input.current.artifactId,
  input.current.reportSha256,
  input.current.proofSha256,
  input.prior.publicationId,
  input.prior.artifactId,
  input.prior.reportSha256,
  input.prior.proofSha256,
  fenceToken,
  `${day}T12:30:00.000Z`,
]);

const lifecycle = async (
  client: PoolClient,
  v1: PublicationTuple,
  v2: PublicationTuple,
) => {
  const result = await client.query<{
    active_publication_id: string;
    v1_status: string;
    v2_status: string;
    artifact_count: string;
    publication_count: string;
    rollback_receipt_count: string;
    canary_receipt_count: string;
    v1_payload_sha256: string;
    v2_payload_sha256: string;
  }>(`SELECT slot.current_publication_id::text AS active_publication_id,
      v1.status::text AS v1_status, v2.status::text AS v2_status,
      encode(sha256(convert_to(v1.artifact_payload::text, 'UTF8')), 'hex')
        AS v1_payload_sha256,
      encode(sha256(convert_to(v2.artifact_payload::text, 'UTF8')), 'hex')
        AS v2_payload_sha256,
      (SELECT count(*) FROM reader_summary_artifacts
        WHERE id=ANY($3::uuid[]))::text AS artifact_count,
      (SELECT count(*) FROM reader_summary_publications
        WHERE id=ANY($4::uuid[]))::text AS publication_count,
      (SELECT count(*) FROM reader_summary_promotion_v2_rollback_receipts
        WHERE replaced_v2_publication_id=$5::uuid)::text
        AS rollback_receipt_count,
      (SELECT count(*)
        FROM reader_summary_promotion_v2_canary_publication_receipts
        WHERE v2_publication_id=$5::uuid)::text AS canary_receipt_count
    FROM reader_summary_publication_slots slot
    JOIN reader_summary_artifacts v1 ON v1.id=$6::uuid
    JOIN reader_summary_artifacts v2 ON v2.id=$7::uuid
    WHERE slot.tenant_id=$1::uuid AND slot.workspace_id=$2::uuid
      AND slot.scope_type='workspace' AND slot.scope_key='workspace'
      AND slot.cadence='daily' AND slot.period_started_at=$8::timestamptz
      AND slot.period_ended_at=$9::timestamptz
      AND slot.period_timezone='UTC'`, [
    readerSummaryPublicationFixtureScope.tenantId,
    readerSummaryPublicationFixtureScope.workspaceId,
    [v1.artifactId, v2.artifactId],
    [v1.publicationId, v2.publicationId],
    v2.publicationId,
    v1.artifactId,
    v2.artifactId,
    startedAt,
    endedAt,
  ]);
  const row = result.rows[0];
  if (row === undefined) throw new Error("Rollback lifecycle row is missing");
  return row;
};

const legacyReaderPublication = async (
  client: PoolClient,
  publicationId: string,
) => {
  const result = await client.query<{
    artifactId: string;
    status: string;
    tenantId: string;
    workspaceId: string;
    scopeType: string;
    interestId: string | null;
    cadence: string;
    periodStartedAt: string;
    periodEndedAt: string;
    periodTimezone: string;
    userId: string | null;
    subscriptionId: string | null;
    headline: string;
    summaryText: string | null;
    createdAt: string;
    artifactPayload: unknown;
  }>(`SELECT artifact.id::text AS "artifactId",
      artifact.status::text AS "status",
      artifact.tenant_id::text AS "tenantId",
      artifact.workspace_id::text AS "workspaceId",
      artifact.scope_type AS "scopeType",
      artifact.interest_id::text AS "interestId", artifact.cadence,
      artifact.period_started_at AS "periodStartedAt",
      artifact.period_ended_at AS "periodEndedAt",
      artifact.period_timezone AS "periodTimezone",
      artifact.user_id AS "userId",
      artifact.subscription_id::text AS "subscriptionId", artifact.headline,
      artifact.summary_text AS "summaryText", artifact.created_at AS "createdAt",
      artifact.artifact_payload AS "artifactPayload"
    FROM reader_summary_artifacts artifact
    JOIN reader_summary_publications publication
      ON publication.reader_summary_artifact_id=artifact.id
    JOIN reader_summary_publication_slots slot
      ON slot.current_publication_id=publication.id
    WHERE publication.id=$1::uuid AND artifact.status='COMPLETED'`, [
    publicationId,
  ]);
  const row = result.rows[0];
  if (row === undefined) {
    throw new Error("Legacy V1 reader did not return the restored artifact");
  }
  return row;
};

const grantFixtureReceiptRead = async (
  client: PoolClient,
  runtimeRole: string,
): Promise<void> => {
  assert(/^[a-z0-9_]+$/u.test(runtimeRole), "fixture runtime role is unsafe");
  await client.query("BEGIN");
  try {
    await client.query('SET LOCAL ROLE "social_monitor_public_schema_owner"');
    await client.query(`GRANT SELECT ON
      reader_summary_promotion_v2_rollback_receipts,
      reader_summary_promotion_v2_canary_publication_receipts
      TO "${runtimeRole}"`);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
};

const receiptCounts = async (client: PoolClient) => {
  const result = await client.query<{ rollback: string; canary: string }>(`
    SELECT
      (SELECT count(*)::text
        FROM reader_summary_promotion_v2_rollback_receipts) AS rollback,
      (SELECT count(*)::text
        FROM reader_summary_promotion_v2_canary_publication_receipts) AS canary
  `);
  return result.rows[0] ?? { rollback: "missing", canary: "missing" };
};
