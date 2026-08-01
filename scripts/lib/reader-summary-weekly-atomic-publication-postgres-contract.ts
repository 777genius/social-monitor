import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { canonicalizeReaderSummaryWeeklyJson } from "../../libs/summary/domain/value-objects/reader-summary-weekly-canonical-json";
import {
  assertPostgres as assert,
  assertPostgresDeepEqual as assertDeepEqual,
  assertPostgresRejectsContaining as assertRejectsContaining,
} from "./reader-summary-publication-postgres-assertions";
import { readerSummaryPublicationFixtureScope } from "./reader-summary-publication-postgres-fixture-scope";

type WeeklyCertificationSeal = Readonly<{
  seal_id: string; seal_sha256: string;
  canonical_record: Readonly<{
    days: readonly Readonly<Record<string, unknown>>[];
  }>;
}>;
type WeeklyDailyEvidenceRow = Readonly<{
  artifact_id: string; artifact_payload_sha256: string; canonical_sha256: string;
  canonical_record: Readonly<Record<string, unknown>>; job_id: string;
  github_evidence: Readonly<Record<string, unknown>>; proof_id: string;
  proof_sha256: string; provider_evidence_sha256: string;
  provider_evidence: readonly Readonly<Record<string, unknown>>[];
  publication_id: string; publication_identity: string; published_at: string;
  report_id: string; report_sha256: string; requested_utc_date: string;
  semantic_status: string; tenant_id: string; workspace_id: string;
}>;
type WeeklyDailyAuthorityFixture = Readonly<{ authorities: readonly Readonly<
  Record<string, unknown>>[]; citation: Readonly<Record<string, unknown>> }>;

type WeeklyAtomicRow = Readonly<{
  outcome: "persisted" | "replayed"; artifact_id: string;
  artifact_payload_sha256: string; proof_sha256: string;
}>;

type WeeklyAtomicPayload = Readonly<{
  artifactId: string; artifactPayload: Readonly<Record<string, unknown>>;
  artifactPayloadSha256: string; headline: string;
  citations: readonly Readonly<Record<string, unknown>>[];
  interestId: string | null; modelVersion: string; periodEndedAt: string;
  periodKey: string; periodStartedAt: string; periodTimezone: "UTC";
  promptVersion: string; qualitySignals: Readonly<Record<string, unknown>>;
  proof: Readonly<Record<string, unknown>> & Readonly<{ sha256: string }>;
  scopeKey: string; scopeType: "workspace" | "interest"; summaryText: string;
  tenantId: string; weekEndedOn: string; weekStartedOn: string;
  workspaceId: string;
}> & Readonly<Record<string, unknown>>;

type WeeklyAtomicContractParams = Readonly<{
  auditorClient: PoolClient; concurrentRuntimeClient: PoolClient;
  runtimeClient: PoolClient; runtimeRole: string;
}>;

const functionName = "persist_reader_summary_weekly_artifact(jsonb)";
const weekStartedOn = "2026-06-01";
const weekEndedOn = "2026-06-07";
const providerOrder = ["github-trending-page", "hacker-news", "reddit", "rss", "x-twitter"] as const;

export const assertReaderSummaryWeeklyAtomicPublicationPostgresContract =
  async (params: WeeklyAtomicContractParams): Promise<void> => {
    await assertCatalogContract(params);
    const seal = await readCertificationSeal(params.runtimeClient);
    const authority = await readDailyAuthorityFixture(params.runtimeClient, seal);
    const payload = buildPayload(seal, authority, randomUUID(), "a");
    const dailyState = await readDailyEvidenceState(params.runtimeClient, seal);
    await assertMissingCanonicalSlot(params.runtimeClient, payload);
    await seedExactLegacyRunningArtifact(params.auditorClient, payload);
    await assertNonRunningLegacyRejected(params, payload);
    await assertFaultRollback(params, payload);

    const outcomes = await Promise.all([
      persistWithSerializableRetry(params.runtimeClient, payload),
      persistWithSerializableRetry(params.concurrentRuntimeClient, payload),
    ]);
    assertDeepEqual(
      [...outcomes.map((row) => row.outcome)].sort(),
      ["persisted", "replayed"],
      "identical concurrent weekly persistence must insert once and replay once",
    );
    for (const row of outcomes) {
      assertExactResult(row, payload);
    }

    const beforeReplay = await readWeeklyState(params.runtimeClient);
    assert(
      expectText(beforeReplay, "artifact_status") === "COMPLETED" &&
      expectText(beforeReplay, "publication_kind") === "WEEKLY_CERTIFIED" &&
      expectText(beforeReplay, "current_publication_id") === payload.artifactId &&
      expectText(beforeReplay, "artifact_created_at") ===
        "2026-06-08T05:00:00.000Z",
      "legacy adoption must complete the exact artifact, publication, and slot",
    );
    const replay = await persistWithSerializableRetry(
      params.runtimeClient,
      reverseObject(payload) as WeeklyAtomicPayload,
    );
    assert(replay.outcome === "replayed", "exact replay must be idempotent");
    assertExactResult(replay, payload);
    assertDeepEqual(
      await readWeeklyState(params.runtimeClient),
      beforeReplay,
      "exact replay must perform zero logical row writes",
    );

    const divergent = buildPayload(seal, authority, payload.artifactId, "b");
    await assertRejectsContaining(
      () => persistWithSerializableRetry(params.runtimeClient, divergent),
      "replay diverged from immutable sealId or sealSha",
      "the same artifact identity with divergent sealed bytes must fail closed",
    );
    assertDeepEqual(
      await readWeeklyState(params.runtimeClient),
      beforeReplay,
      "divergent persistence must leave the winning artifact and slot unchanged",
    );

    for (const [label, invalid] of invalidBindings(payload)) {
      await assertRejectsContaining(
        () => persistWithSerializableRetry(params.runtimeClient, invalid),
        label,
        `weekly persistence must reject ${label}`,
      );
      assertDeepEqual(
        await readWeeklyState(params.runtimeClient),
        beforeReplay,
        `${label} rejection must not write`,
      );
    }

    await assertDirectWeeklyWriteDenied(params.runtimeClient, payload);
    assertDeepEqual(
      await readDailyEvidenceState(params.runtimeClient, seal),
      dailyState,
      "weekly publication must preserve all seven daily artifacts and the seal",
    );
  };

const assertCatalogContract = async (
  params: WeeklyAtomicContractParams,
): Promise<void> => {
  const result = await params.auditorClient.query<{
    readonly capability_execute: boolean;
    readonly fixed_search_path: boolean;
    readonly function_definition: string;
    readonly function_owner: string;
    readonly public_execute: boolean;
    readonly runtime_direct_execute: boolean;
    readonly runtime_execute: boolean;
    readonly security_definer: boolean;
    readonly unexpected_execute: boolean;
    readonly weekly_kind_constraint: boolean;
    readonly trigger_count: string;
  }>(
    `WITH target AS (
       SELECT procedure.*
       FROM pg_catalog.pg_proc AS procedure
       WHERE procedure.oid = $1::regprocedure
     )
     SELECT
       pg_catalog.pg_get_userbyid(target.proowner) AS function_owner,
       target.prosecdef AS security_definer,
       target.proconfig = ARRAY[
         'search_path=pg_catalog, public'
       ]::TEXT[] AS fixed_search_path,
       pg_catalog.pg_get_functiondef(target.oid) AS function_definition,
       pg_catalog.has_function_privilege(
         $2, target.oid, 'EXECUTE'
       ) AS runtime_execute,
       EXISTS (
         SELECT 1
         FROM pg_catalog.aclexplode(COALESCE(
           target.proacl,
           pg_catalog.acldefault('f', target.proowner)
         )) AS privilege
         JOIN pg_catalog.pg_roles AS grantee
           ON grantee.oid = privilege.grantee
         WHERE grantee.rolname = $2
           AND privilege.privilege_type = 'EXECUTE'
       ) AS runtime_direct_execute,
       pg_catalog.has_function_privilege(
         'social_monitor_reader_summary_publication_runtime',
         target.oid,
         'EXECUTE'
       ) AS capability_execute,
       pg_catalog.has_function_privilege(
         'public', target.oid, 'EXECUTE'
       ) AS public_execute,
       EXISTS (
         SELECT 1
         FROM pg_catalog.aclexplode(COALESCE(
           target.proacl,
           pg_catalog.acldefault('f', target.proowner)
         )) AS privilege
         WHERE privilege.privilege_type = 'EXECUTE'
           AND privilege.grantee NOT IN (
             target.proowner,
             (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = $2)
           )
       ) AS unexpected_execute,
       pg_catalog.pg_get_constraintdef(kind_constraint.oid) LIKE
         '%WEEKLY_CERTIFIED%' AS weekly_kind_constraint,
       (
         SELECT count(*)::TEXT
         FROM pg_catalog.pg_trigger AS trigger
         WHERE trigger.tgrelid =
             'public.reader_summary_artifacts'::regclass
           AND trigger.tgname =
             'reader_summary_weekly_artifacts_guarded'
           AND trigger.tgenabled = 'O'
           AND trigger.tgfoid =
             'public.guard_reader_summary_weekly_artifact_mutation()'::regprocedure
       ) AS trigger_count
     FROM target
     JOIN pg_catalog.pg_constraint AS kind_constraint
       ON kind_constraint.conrelid =
          'public.reader_summary_publications'::regclass
      AND kind_constraint.conname =
          'reader_summary_publications_kind_check'`,
    [functionName, params.runtimeRole],
  );
  const row = result.rows[0];
  assert(row !== undefined, "weekly atomic function must exist");
  assert(
    row.function_owner ===
      "social_monitor_reader_summary_publication_owner" &&
      row.security_definer &&
      row.fixed_search_path &&
      row.runtime_execute &&
      row.runtime_direct_execute &&
      !row.capability_execute &&
      !row.public_execute &&
      !row.unexpected_execute &&
      row.weekly_kind_constraint &&
      row.trigger_count === "1",
    "weekly atomic function ownership, ACL, path, or trigger is unsafe",
  );
  assert(
    /current_setting\('transaction_isolation'\)\s*<>\s*'serializable'/iu
      .test(row.function_definition) &&
      !/\bLOCK\s+TABLE\b/iu.test(row.function_definition) &&
      !/pg_advisory/iu.test(row.function_definition) &&
      /FOR\s+UPDATE/iu.test(row.function_definition) &&
      !/INSERT\s+INTO\s+"?reader_summary_publication_slots"?/iu
        .test(row.function_definition),
    "weekly persistence must enforce SERIALIZABLE slot row locks only",
  );
};

const readCertificationSeal = async (
  client: PoolClient,
): Promise<WeeklyCertificationSeal> => {
  const result = await client.query<WeeklyCertificationSeal>(
    `SELECT seal_id, btrim(seal_sha256) AS seal_sha256, canonical_record
       FROM reader_summary_weekly_certification_seals
      WHERE tenant_id = $1::uuid
        AND workspace_id = $2::uuid
        AND scope_type = 'workspace'
        AND scope_key = 'workspace'
        AND week_started_on = $3::date`,
    [
      readerSummaryPublicationFixtureScope.tenantId,
      readerSummaryPublicationFixtureScope.workspaceId,
      weekStartedOn,
    ],
  );
  const seal = result.rows[0];
  assert(seal !== undefined, "weekly DB certification seal must exist");
  return seal;
};

const readDailyAuthorityFixture = async (
  client: PoolClient,
  seal: WeeklyCertificationSeal,
): Promise<WeeklyDailyAuthorityFixture> => {
  const result = await client.query<WeeklyDailyEvidenceRow>(
    `SELECT evidence.tenant_id::TEXT AS tenant_id,
            evidence.workspace_id::TEXT AS workspace_id,
            evidence.publication_id::TEXT AS publication_id,
            evidence.reader_summary_artifact_id::TEXT AS artifact_id,
            evidence.reader_summary_job_id::TEXT AS job_id,
            evidence.report_id, evidence.proof_id,
            evidence.semantic_status::TEXT AS semantic_status,
            to_char(evidence.requested_utc_date, 'YYYY-MM-DD') AS requested_utc_date,
            evidence.identity AS publication_identity,
            btrim(evidence.canonical_sha256) AS canonical_sha256,
            btrim(evidence.report_sha256) AS report_sha256,
            btrim(evidence.proof_sha256) AS proof_sha256,
            btrim(evidence.artifact_payload_sha256) AS artifact_payload_sha256,
            btrim(evidence.provider_evidence_sha256) AS provider_evidence_sha256,
            evidence.provider_evidence, evidence.github_evidence,
            evidence.canonical_record,
            evidence.canonical_record->>'publishedAt' AS published_at
       FROM reader_summary_weekly_certification_seals AS seal
       CROSS JOIN LATERAL jsonb_array_elements(seal.days)
         WITH ORDINALITY AS day(value, position)
       JOIN reader_summary_weekly_publication_evidence AS evidence
         ON evidence.publication_id::TEXT = day.value->>'publicationId'
      WHERE seal.seal_id = $1
      ORDER BY day.position`,
    [seal.seal_id],
  );
  assert(result.rows.length === 7, "weekly authority fixture requires 7 days");
  const authorities = result.rows.map(authorityFromEvidenceRow);
  const citationRow = result.rows.find((row) => row.provider_evidence.length > 0);
  const provider = citationRow?.provider_evidence[0];
  assert(
    citationRow !== undefined && provider !== undefined,
    "weekly authority fixture requires real provider evidence",
  );
  return {
    authorities,
    citation: citationFromEvidenceRow(citationRow, provider),
  };
};

const authorityFromEvidenceRow = (
  row: WeeklyDailyEvidenceRow,
): Readonly<Record<string, unknown>> => {
  const githubSha = expectText(row.github_evidence, "sha256");
  const githubBody = Object.fromEntries(Object.entries(row.github_evidence)
    .filter(([key]) => key !== "sha256"));
  assert(
    githubSha === canonicalizeReaderSummaryWeeklyJson(githubBody).sha256,
    "weekly authority fixture GitHub evidence hash must be canonical",
  );
  const evidence = row.provider_evidence
    .map((item) => Object.fromEntries(Object.entries(item).filter(
      ([key]) => key !== "title" && key !== "sourceText",
    )))
    .sort((left, right) =>
      providerRank(expectText(left, "providerKey")) -
        providerRank(expectText(right, "providerKey")) ||
      lexicalCompare(expectText(left, "sourceItemId"),
        expectText(right, "sourceItemId")) ||
      lexicalCompare(expectText(left, "citationId"),
        expectText(right, "citationId")));
  const body = {
    schemaVersion: "reader_summary.weekly_story_authority.v1",
    tenantId: row.tenant_id, workspaceId: row.workspace_id,
    scope: row.canonical_record.scope,
    requestedUtcDate: row.requested_utc_date,
    publicationId: row.publication_id, artifactId: row.artifact_id,
    jobId: row.job_id, reportId: row.report_id, proofId: row.proof_id,
    publicationEvidenceIdentity: row.publication_identity,
    publicationEvidenceSha256: row.canonical_sha256,
    reportSha256: row.report_sha256, proofSha256: row.proof_sha256,
    artifactPayloadSha256: row.artifact_payload_sha256,
    providerEvidenceSha256: row.provider_evidence_sha256,
    githubEvidenceSha256: githubSha, semanticStatus: row.semantic_status,
    publishedAt: row.published_at, evidence,
  };
  const storySha = canonicalizeReaderSummaryWeeklyJson(body).sha256;
  return {
    requestedUtcDate: row.requested_utc_date,
    publicationId: row.publication_id,
    publicationEvidenceIdentity: row.publication_identity,
    publicationEvidenceSha256: row.canonical_sha256,
    storyAuthorityIdentity: `reader_summary.weekly_story_authority.v1:${storySha}`,
    storyAuthoritySha256: storySha,
    githubBoardIdentity:
      `reader_summary.weekly_publication_github_evidence.v1:${githubSha}`,
    githubBoardSha256: githubSha,
  };
};

const providerRank = (providerKey: string): number => {
  const rank = providerOrder.findIndex((candidate) => candidate === providerKey);
  assert(rank >= 0, "weekly authority fixture provider must be canonical");
  return rank;
};
const lexicalCompare = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;
const citationFromEvidenceRow = (
  row: WeeklyDailyEvidenceRow,
  provider: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => ({
  citationId: provider.citationId,
  requestedUtcDate: row.requested_utc_date,
  publicationId: row.publication_id,
  publicationEvidenceIdentity: row.publication_identity,
  providerKey: provider.providerKey, feedItemId: provider.feedItemId,
  sourceItemId: provider.sourceItemId, sourceBindingId: provider.sourceBindingId,
  providerItemId: provider.providerItemId, canonicalUrl: provider.canonicalUrl,
  sourceContentHash: provider.sourceContentHash,
});

const buildPayload = (
  seal: WeeklyCertificationSeal,
  authority: WeeklyDailyAuthorityFixture,
  artifactId: string,
  salt: string,
): WeeklyAtomicPayload => {
  const modelSealSha256 = canonicalizeReaderSummaryWeeklyJson({
    artifactId,
    manifestSealId: seal.seal_id,
    salt,
  }).sha256;
  const modelSealId =
    `reader_summary.weekly_model_input.v1:${modelSealSha256}`;
  const citation = authority.citation;
  const citationId = expectText(citation, "citationId");
  const storyId = "story:atomic-weekly";
  const output = {
    schemaVersion: "reader_summary.weekly_model_output.v1",
    sealId: modelSealId,
    sealSha: modelSealSha256,
    weekStartedOn,
    weekEndedOn,
    headline: `Atomic weekly headline ${salt}`,
    headlineCitationIds: [citationId],
    takeaway: `Atomic weekly takeaway ${salt}`,
    takeawayCitationIds: [citationId],
    synthesis: `Atomic weekly synthesis ${salt}`,
    synthesisCitationIds: [citationId],
    stories: [{
      storyId,
      headline: "Atomic publication preserves certified weekly authority",
      summary:
        "The certified weekly artifact is published once and exact retries replay without changing persisted rows.",
      status: "developing",
      observedFrom: citation.requestedUtcDate,
      observedThrough: citation.requestedUtcDate,
      citationIds: [citationId],
    }],
    sections: [{
      sectionId: "section:atomic-weekly-lead",
      storyId,
      kind: "lead",
      claimType: "snapshot",
      heading: "Certified publication remains atomic",
      text:
        "A precreated canonical slot serializes publication and exact replay.",
      observedFrom: citation.requestedUtcDate,
      observedThrough: citation.requestedUtcDate,
      citationIds: [citationId],
    }],
  };
  const editorialQuality = {
    policyVersion: "reader_summary.weekly_editorial_quality.v2",
    publicationDecision: "allow",
    metrics: {},
    qualityGates: {},
    issues: [],
    blockingPassed: true,
  };
  const proofBody = {
    schemaVersion: "reader_summary.weekly_publication_proof.v1",
    artifactId,
    tenantId: readerSummaryPublicationFixtureScope.tenantId,
    workspaceId: readerSummaryPublicationFixtureScope.workspaceId,
    scope: { type: "workspace" },
    weekStartedOn,
    weekEndedOn,
    manifestSealId: seal.seal_id,
    manifestSealSha256: seal.seal_sha256,
    modelInputSealId: modelSealId,
    modelInputSealSha256: modelSealSha256,
    artifactSha256: canonicalizeReaderSummaryWeeklyJson(output).sha256,
    editorialQualitySha256:
      canonicalizeReaderSummaryWeeklyJson(editorialQuality).sha256,
    authorities: authority.authorities,
    citations: [citation],
  };
  const proofSha256 = canonicalizeReaderSummaryWeeklyJson(proofBody).sha256;
  const proof = {
    ...proofBody,
    authorizationId:
      `reader_summary.weekly_publication_authorization.v1:${proofSha256}`,
    sha256: proofSha256,
  };
  const artifactPayload = {
    schemaVersion: "reader_summary.weekly_persisted_artifact.v1",
    output,
    publicationProof: proof,
  };
  const periodStartedAt = `${weekStartedOn}T00:00:00.000Z`;
  const periodEndedAt = "2026-06-08T00:00:00.000Z";
  return {
    schemaVersion: "reader_summary.weekly_artifact_persistence.v2",
    artifactId,
    tenantId: readerSummaryPublicationFixtureScope.tenantId,
    workspaceId: readerSummaryPublicationFixtureScope.workspaceId,
    scopeType: "workspace",
    scopeKey: "workspace",
    interestId: null,
    cadence: "weekly",
    weekStartedOn,
    weekEndedOn,
    periodStartedAt,
    periodEndedAt,
    periodTimezone: "UTC",
    periodKey: `weekly:${periodStartedAt}:${periodEndedAt}:UTC`,
    sealId: modelSealId,
    sealSha256: modelSealSha256,
    manifestSealId: seal.seal_id,
    manifestSealSha256: seal.seal_sha256,
    headline: output.headline,
    summaryText: output.synthesis,
    modelVersion: output.schemaVersion,
    promptVersion: editorialQuality.policyVersion,
    artifactPayload,
    artifactPayloadSha256:
      canonicalizeReaderSummaryWeeklyJson(artifactPayload).sha256,
    citations: [citation],
    qualitySignals: {
      kind: "weekly",
      editorialQuality,
      weeklyPublicationProof: proof,
    },
    proof,
  };
};

const persistWithSerializableRetry = async (
  client: PoolClient,
  payload: WeeklyAtomicPayload,
): Promise<WeeklyAtomicRow> => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    try {
      const result = await client.query<WeeklyAtomicRow>(
        `SELECT * FROM persist_reader_summary_weekly_artifact($1::jsonb)`,
        [JSON.stringify(payload)],
      );
      const row = result.rows[0];
      assert(
        result.rows.length === 1 && row !== undefined,
        "weekly persistence function must return one row",
      );
      await client.query("COMMIT");
      return row;
    } catch (error: unknown) {
      await client.query("ROLLBACK");
      if (postgresCode(error) === "40001" && attempt < 4) {
        continue;
      }
      throw error;
    }
  }
  throw new Error("weekly persistence exhausted SERIALIZABLE retries");
};

const postgresCode = (error: unknown): string | undefined =>
  typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;

const assertExactResult = (
  row: WeeklyAtomicRow,
  payload: WeeklyAtomicPayload,
): void => {
  assert(
    row.artifact_id === payload.artifactId &&
      row.artifact_payload_sha256 === payload.artifactPayloadSha256 &&
      row.proof_sha256 === payload.proof.sha256,
    "weekly persistence returned a mismatched artifact or proof",
  );
};

const assertMissingCanonicalSlot = async (
  client: PoolClient,
  payload: WeeklyAtomicPayload,
): Promise<void> => {
  const before = await readWeeklyState(client);
  await assertRejectsContaining(
    () => persistWithSerializableRetry(client, payload),
    "requires a precreated canonical slot",
    "weekly persistence must reject a missing canonical slot",
  );
  assertDeepEqual(
    await readWeeklyState(client),
    before,
    "missing canonical slot rejection must perform zero writes",
  );
};

const readWeeklyState = async (client: PoolClient): Promise<unknown> => {
  const result = await client.query(
    `SELECT
       (SELECT count(*)::TEXT FROM reader_summary_publication_slots
         WHERE tenant_id = $1::uuid AND workspace_id = $2::uuid
           AND cadence = 'weekly'
           AND period_started_at = $3::timestamptz) AS slots,
       (SELECT count(*)::TEXT FROM reader_summary_artifacts
         WHERE tenant_id = $1::uuid AND workspace_id = $2::uuid
           AND cadence = 'weekly'
           AND period_started_at = $3::timestamptz) AS artifacts,
       (SELECT count(*)::TEXT FROM reader_summary_publications
         WHERE tenant_id = $1::uuid AND workspace_id = $2::uuid
           AND cadence = 'weekly'
           AND period_started_at = $3::timestamptz) AS publications,
       (SELECT xmin::TEXT FROM reader_summary_publication_slots
         WHERE tenant_id = $1::uuid AND workspace_id = $2::uuid
           AND cadence = 'weekly'
           AND period_started_at = $3::timestamptz) AS slot_xmin,
       (SELECT to_char(updated_at AT TIME ZONE 'UTC',
                       'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
          FROM reader_summary_publication_slots
         WHERE tenant_id = $1::uuid AND workspace_id = $2::uuid
           AND cadence = 'weekly'
           AND period_started_at = $3::timestamptz) AS slot_updated_at,
       (SELECT xmin::TEXT FROM reader_summary_artifacts
         WHERE tenant_id = $1::uuid AND workspace_id = $2::uuid
           AND cadence = 'weekly'
           AND period_started_at = $3::timestamptz) AS artifact_xmin,
       (SELECT to_char(created_at AT TIME ZONE 'UTC',
                       'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
          FROM reader_summary_artifacts
         WHERE tenant_id = $1::uuid AND workspace_id = $2::uuid
           AND cadence = 'weekly'
           AND period_started_at = $3::timestamptz) AS artifact_created_at,
       (SELECT to_char(updated_at AT TIME ZONE 'UTC',
                       'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
          FROM reader_summary_artifacts
         WHERE tenant_id = $1::uuid AND workspace_id = $2::uuid
           AND cadence = 'weekly'
           AND period_started_at = $3::timestamptz) AS artifact_updated_at,
       (SELECT status::TEXT FROM reader_summary_artifacts
         WHERE tenant_id = $1::uuid AND workspace_id = $2::uuid
           AND cadence = 'weekly'
           AND period_started_at = $3::timestamptz) AS artifact_status,
       (SELECT xmin::TEXT FROM reader_summary_publications
         WHERE tenant_id = $1::uuid AND workspace_id = $2::uuid
           AND cadence = 'weekly'
           AND period_started_at = $3::timestamptz) AS publication_xmin,
       (SELECT to_char(requested_at AT TIME ZONE 'UTC',
                       'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
          FROM reader_summary_publications
         WHERE tenant_id = $1::uuid AND workspace_id = $2::uuid
           AND cadence = 'weekly'
           AND period_started_at = $3::timestamptz) AS publication_requested_at,
       (SELECT to_char(published_at AT TIME ZONE 'UTC',
                       'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
          FROM reader_summary_publications
         WHERE tenant_id = $1::uuid AND workspace_id = $2::uuid
           AND cadence = 'weekly'
           AND period_started_at = $3::timestamptz) AS publication_published_at,
       (SELECT publication_kind FROM reader_summary_publications
         WHERE tenant_id = $1::uuid AND workspace_id = $2::uuid
           AND cadence = 'weekly'
           AND period_started_at = $3::timestamptz) AS publication_kind,
       (SELECT current_publication_id::TEXT
          FROM reader_summary_publication_slots
         WHERE tenant_id = $1::uuid AND workspace_id = $2::uuid
           AND cadence = 'weekly'
           AND period_started_at = $3::timestamptz) AS current_publication_id`,
    [
      readerSummaryPublicationFixtureScope.tenantId,
      readerSummaryPublicationFixtureScope.workspaceId,
      `${weekStartedOn}T00:00:00.000Z`,
    ],
  );
  return result.rows[0];
};

const seedExactLegacyRunningArtifact = async (
  client: PoolClient,
  payload: WeeklyAtomicPayload,
): Promise<void> => {
  await client.query("BEGIN");
  try {
    await client.query(
      `SET LOCAL ROLE "social_monitor_reader_summary_publication_owner"`,
    );
    await client.query(
      `SELECT set_config('social_monitor.tenant_id', $1, true),
              set_config('social_monitor.workspace_id', $2, true),
              set_config('social_monitor.system_access', 'false', true)`,
      [payload.tenantId, payload.workspaceId],
    );
    await client.query(
      `INSERT INTO reader_summary_artifacts (
         id, tenant_id, workspace_id, scope_type, scope_key, interest_id,
         cadence, period_started_at, period_ended_at, period_timezone,
         period_key, user_id, subscription_id, status, schema_version,
         model_version, prompt_version, headline, summary_text,
         artifact_payload, citations, quality_signals, created_at, updated_at
       ) VALUES (
         $1::uuid, $2::uuid, $3::uuid, $4, $5, $6::uuid,
         'weekly', $7::timestamptz, $8::timestamptz, 'UTC',
         $9, NULL, NULL, 'RUNNING', 1, $10, $11, $12, $13,
         $14::jsonb, $15::jsonb, $16::jsonb,
         '2026-06-08T05:00:00.000Z'::timestamptz,
         '2026-06-08T05:00:00.000Z'::timestamptz
       )`,
      [
        payload.artifactId, payload.tenantId, payload.workspaceId,
        payload.scopeType, payload.scopeKey, payload.interestId,
        payload.periodStartedAt, payload.periodEndedAt, payload.periodKey,
        payload.modelVersion, payload.promptVersion, payload.headline,
        payload.summaryText, JSON.stringify(payload.artifactPayload),
        JSON.stringify(payload.citations), JSON.stringify(payload.qualitySignals),
      ],
    );
    await client.query(
      `INSERT INTO reader_summary_publication_slots (
         tenant_id, workspace_id, scope_type, scope_key, cadence,
         period_started_at, period_ended_at, period_timezone,
         current_publication_id, updated_at
       ) VALUES (
         $1::uuid, $2::uuid, $3, $4, 'weekly',
         $5::timestamptz, $6::timestamptz, 'UTC', NULL,
         '2026-06-08T05:00:00.000Z'::timestamptz
       )`,
      [
        payload.tenantId, payload.workspaceId,
        payload.scopeType, payload.scopeKey,
        payload.periodStartedAt, payload.periodEndedAt,
      ],
    );
    await client.query("COMMIT");
  } catch (error: unknown) {
    await client.query("ROLLBACK");
    throw error;
  }
  const state = await readWeeklyState(client);
  assertDeepEqual(
    state,
    {
      slots: "1", artifacts: "1", publications: "0",
      slot_xmin: expectText(state, "slot_xmin"),
      slot_updated_at: "2026-06-08T05:00:00.000Z",
      artifact_xmin: expectText(state, "artifact_xmin"),
      artifact_created_at: "2026-06-08T05:00:00.000Z",
      artifact_updated_at: "2026-06-08T05:00:00.000Z",
      artifact_status: "RUNNING", publication_xmin: null,
      publication_requested_at: null, publication_published_at: null,
      publication_kind: null, current_publication_id: null,
    },
    "legacy adoption fixture must have its canonical empty slot and one exact RUNNING artifact",
  );
};

const assertFaultRollback = async (
  params: WeeklyAtomicContractParams,
  payload: WeeklyAtomicPayload,
): Promise<void> => {
  await installWeeklyPublicationFault(params.auditorClient);
  const before = await readWeeklyState(params.runtimeClient);
  try {
    await assertRejectsContaining(
      () => persistWithSerializableRetry(params.runtimeClient, payload),
      "weekly publication fault injection",
      "publication failure must abort the legacy status adoption",
    );
    assertDeepEqual(
      await readWeeklyState(params.runtimeClient),
      before,
      "publication failure must roll back artifact, publication, and slot writes",
    );
  } finally {
    await removeWeeklyPublicationFault(params.auditorClient);
  }
};

const assertNonRunningLegacyRejected = async (
  params: WeeklyAtomicContractParams,
  payload: WeeklyAtomicPayload,
): Promise<void> => {
  await setLegacyArtifactStatus(params.auditorClient, payload, "COMPLETED");
  const before = await readWeeklyState(params.runtimeClient);
  try {
    await assertRejectsContaining(
      () => persistWithSerializableRetry(params.runtimeClient, payload),
      "replay diverged from immutable sealId or sealSha",
      "only an exact RUNNING legacy artifact may be adopted",
    );
    assertDeepEqual(
      await readWeeklyState(params.runtimeClient),
      before,
      "a non-RUNNING legacy artifact rejection must perform zero writes",
    );
  } finally {
    await setLegacyArtifactStatus(params.auditorClient, payload, "RUNNING");
  }
};

const setLegacyArtifactStatus = async (
  client: PoolClient,
  payload: WeeklyAtomicPayload,
  status: "COMPLETED" | "RUNNING",
): Promise<void> => {
  await client.query("BEGIN");
  try {
    await client.query(
      `SET LOCAL ROLE "social_monitor_reader_summary_publication_owner"`,
    );
    await client.query(
      `SELECT set_config('social_monitor.tenant_id', $1, true),
              set_config('social_monitor.workspace_id', $2, true),
              set_config('social_monitor.system_access', 'false', true)`,
      [payload.tenantId, payload.workspaceId],
    );
    const result = await client.query(
      `UPDATE reader_summary_artifacts
          SET status = $2::"SummaryStatus"
        WHERE id = $1::uuid
          AND tenant_id = $3::uuid
          AND workspace_id = $4::uuid`,
      [payload.artifactId, status, payload.tenantId, payload.workspaceId],
    );
    assert(result.rowCount === 1, "legacy artifact status fixture must exist");
    await client.query("COMMIT");
  } catch (error: unknown) {
    await client.query("ROLLBACK");
    throw error;
  }
};

const installWeeklyPublicationFault = async (
  client: PoolClient,
): Promise<void> => {
  await client.query(
    `CREATE FUNCTION reader_summary_weekly_contract_fault()
       RETURNS trigger
       LANGUAGE plpgsql
       SET search_path = pg_catalog, public
       AS $$
       BEGIN
         RAISE EXCEPTION 'weekly publication fault injection';
       END;
       $$;
     CREATE TRIGGER reader_summary_weekly_contract_fault
       BEFORE INSERT ON reader_summary_publications
       FOR EACH ROW
       EXECUTE FUNCTION reader_summary_weekly_contract_fault()`,
  );
};

const removeWeeklyPublicationFault = async (
  client: PoolClient,
): Promise<void> => {
  await client.query(
    `DROP TRIGGER reader_summary_weekly_contract_fault
       ON reader_summary_publications;
     DROP FUNCTION reader_summary_weekly_contract_fault()`,
  );
};

const invalidBindings = (
  payload: WeeklyAtomicPayload,
): readonly (readonly [string, WeeklyAtomicPayload])[] => [
  [
    "session scope diverged",
    { ...payload, tenantId: "99999999-9999-4999-8999-999999999999" },
  ],
  [
    "week binding is invalid",
    { ...payload, weekEndedOn: "2026-06-08" },
  ],
  [
    "immutable proof binding is invalid",
    { ...payload, sealSha256: "f".repeat(64) },
  ],
  [
    "immutable database certification seal",
    { ...payload, manifestSealSha256: "e".repeat(64) },
  ],
  [
    "proof scope diverged",
    rebindProof(payload, (body) => ({ ...body, scope: null })),
  ],
  [
    "immutable database certification seal",
    rebindProof(payload, (body) => ({
      ...body,
      authorities: forgeFirstAuthority(body.authorities),
    })),
  ],
  [
    "immutable database certification seal",
    rebindCitations(payload),
  ],
];

const rebindProof = (
  payload: WeeklyAtomicPayload,
  mutate: (
    body: Readonly<Record<string, unknown>>,
  ) => Readonly<Record<string, unknown>>,
): WeeklyAtomicPayload => {
  const body = mutate(
    Object.fromEntries(
      Object.entries(payload.proof).filter(
        ([key]) => key !== "authorizationId" && key !== "sha256",
      ),
    ),
  );
  const sha256 = canonicalizeReaderSummaryWeeklyJson(body).sha256;
  const proof = {
    ...body,
    authorizationId:
      `reader_summary.weekly_publication_authorization.v1:${sha256}`,
    sha256,
  };
  const artifactPayload = {
    ...payload.artifactPayload,
    publicationProof: proof,
  };
  return {
    ...payload,
    proof,
    artifactPayload,
    artifactPayloadSha256:
      canonicalizeReaderSummaryWeeklyJson(artifactPayload).sha256,
    qualitySignals: {
      ...payload.qualitySignals,
      weeklyPublicationProof: proof,
    },
  };
};

const forgeFirstAuthority = (value: unknown): readonly unknown[] => {
  assert(Array.isArray(value), "weekly proof authorities must be an array");
  return value.map((authority, index) =>
    index === 0 && typeof authority === "object" && authority !== null
      ? {
          ...authority,
          storyAuthorityIdentity: "forged:story-authority",
          storyAuthoritySha256: "f".repeat(64),
          githubBoardIdentity: "forged:github-board",
          githubBoardSha256: "e".repeat(64),
        }
      : authority,
  );
};

const rebindCitations = (payload: WeeklyAtomicPayload): WeeklyAtomicPayload => {
  const citations = payload.citations.map((citation, index) =>
    index === 0
      ? { ...citation, canonicalUrl: "https://example.test/forged-citation" }
      : citation,
  );
  const rebound = rebindProof(payload, (body) => ({ ...body, citations }));
  return { ...rebound, citations };
};

const assertDirectWeeklyWriteDenied = async (
  client: PoolClient,
  payload: WeeklyAtomicPayload,
): Promise<void> => {
  await assertRejectsContaining(
    () =>
      client.query(
        `UPDATE reader_summary_artifacts
            SET headline = headline || ' forged'
          WHERE id = $1::uuid`,
        [payload.artifactId],
    ),
    "published reader summary artifact is immutable",
    "runtime must not mutate a weekly artifact directly",
  );
};

const readDailyEvidenceState = async (
  client: PoolClient,
  seal: WeeklyCertificationSeal,
): Promise<unknown> => {
  const artifactIds = seal.canonical_record.days.map((day) =>
    String(day.artifactId),
  );
  const artifacts = await client.query(
    `SELECT xmin::TEXT, id::TEXT, status::TEXT, updated_at::TEXT,
            artifact_payload, citations, quality_signals
       FROM reader_summary_artifacts
      WHERE id = ANY($1::uuid[])
        AND cadence = 'daily'
        AND status IN ('COMPLETED', 'NO_SIGNAL')
      ORDER BY id`,
    [artifactIds],
  );
  const persistedSeal = await client.query(
    `SELECT xmin::TEXT, seal_id, btrim(seal_sha256) AS seal_sha256,
            days, canonical_record, canonical_bytes, recorded_at::TEXT
       FROM reader_summary_weekly_certification_seals
      WHERE seal_id = $1`,
    [seal.seal_id],
  );
  assert(
    artifacts.rows.length === 7 && persistedSeal.rows.length === 1,
    "weekly atomic persistence requires seven daily artifacts and one seal",
  );
  return { artifacts: artifacts.rows, seal: persistedSeal.rows[0] };
};

const expectText = (value: unknown, key: string): string => {
  if (typeof value !== "object" || value === null || !(key in value)) {
    throw new Error(`weekly state is missing ${key}`);
  }
  const field = (value as Readonly<Record<string, unknown>>)[key];
  if (typeof field !== "string" || field.length === 0) {
    throw new Error(`weekly state ${key} is not text`);
  }
  return field;
};

const reverseObject = (
  value: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> =>
  Object.fromEntries(Object.entries(value).reverse());
