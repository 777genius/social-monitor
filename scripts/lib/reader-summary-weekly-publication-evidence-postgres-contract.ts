import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { canonicalizeReaderSummaryWeeklyJson } from "../../libs/summary/domain/value-objects/reader-summary-weekly-canonical-json";
import { buildReaderSummaryGitHubProjectionCollectionTelemetry } from "../../libs/summary/domain/policies/reader-summary-github-projection-audit";
import {
  deriveReaderSummaryWeeklyPublicationEvidence,
  type ReaderSummaryWeeklyDailyPeriod,
  type ReaderSummaryWeeklyManifestScope,
  type ReaderSummaryWeeklyPublicationGitHubEvidence,
  type ReaderSummaryWeeklyPublicationProviderEvidence,
} from "../../libs/summary/domain";
export type ReaderSummaryPublicationEvidenceFixture = Readonly<{
  jobId: string;
  artifactId: string;
  eventId: string;
  payload: Readonly<Record<string, unknown>>;
  githubSourceBindingId?: string;
}>;
export type ReaderSummaryPublicationGitHubEvidenceMode =
  | "verified"
  | "ordinary_not_required"
  | "historical_unavailable";
export type EvidenceFixtureOverrides = Readonly<{
  providerEvidence?: "default" | "none" | "rss";
  githubEvidenceMode?: ReaderSummaryPublicationGitHubEvidenceMode;
  publicationInterestId?: string;
}>;
export type ReaderSummaryPublicationFixtureAuthority = Readonly<{
  citations: readonly Readonly<Record<string, unknown>>[];
  content: Readonly<Record<string, unknown>>;
  githubProjectionAudit: Readonly<Record<string, unknown>>;
  githubSourceBindingId?: string;
}>;
export const createReaderSummaryPublicationFixtureAuthority = async (params: {
  readonly client: PoolClient;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly status: "COMPLETED" | "NO_SIGNAL";
  readonly startedAt: string;
  readonly endedAt: string;
  readonly requestedAt: string;
  readonly overrides?: EvidenceFixtureOverrides;
}): Promise<ReaderSummaryPublicationFixtureAuthority> => {
  const mode =
    params.overrides?.githubEvidenceMode ??
    (params.status === "NO_SIGNAL"
      ? "ordinary_not_required"
      : "historical_unavailable");
  if (mode === "verified") {
    return createVerifiedGitHubAuthority(params);
  }
  const citations =
    params.overrides?.providerEvidence === "rss" ||
    (params.overrides?.providerEvidence !== "none" &&
      params.status === "COMPLETED")
      ? [await createRssCitation(params)]
      : [];
  const common = {
    schemaVersion: "reader_summary.github_projection.v1",
    status: "not_required",
    requestedUtcDay: params.startedAt.slice(0, 10),
    pageCount: mode === "ordinary_not_required" ? 1 : 0,
    scannedItemCount: 0,
    eligibleBindingIds: [],
    bindings: [],
    violationCodes: [],
    reasons: [],
  };
  return {
    citations,
    content:
      params.status === "NO_SIGNAL"
        ? {
            qualityState: {
              status: "no_signal",
              flags: ["no_signal"],
            },
            topReads: [],
            selectedPosts: [],
            narrativeSections: [],
          }
        : { selectedPosts: [] },
    githubProjectionAudit:
      mode === "historical_unavailable"
        ? {
            ...common,
            historicalOmission: {
              mode: "github_projection_unavailable_historical",
              reason:
                "Authorized source snapshot is unavailable for this historical day.",
              authorizedAt: params.endedAt,
            },
          }
        : common,
  };
};
export const assertReaderSummaryWeeklyPublicationEvidencePostgresContract =
  async (params: {
    readonly runtimeClient: PoolClient; readonly canonicalJsonAuditor: PoolClient;
    readonly createFixture: (
      status: "COMPLETED" | "NO_SIGNAL",
      day: number,
      overrides?: EvidenceFixtureOverrides,
    ) => Promise<ReaderSummaryPublicationEvidenceFixture>;
    readonly publish: (
      payload: Readonly<Record<string, unknown>>,
    ) => Promise<string>;
    readonly assertNoPublication: (
      fixture: ReaderSummaryPublicationEvidenceFixture,
    ) => Promise<void>;
  }): Promise<void> => {
    await assertCanonicalJsonParityAndBounds(params.canonicalJsonAuditor);
    await assertCanonicalFunctionsAreHardened(params.canonicalJsonAuditor);
    await assertDbAuthorityAndJoinGuards(params);
    const ordinaryNoSignal = await params.createFixture("NO_SIGNAL", 20);
    assert(
      (await params.publish(readerSummaryPublicationDbOwnedRequest(ordinaryNoSignal))) === "published",
      "ordinary NO_SIGNAL evidence must publish",
    );
    await assertReaderSummaryWeeklyPublicationEvidenceRow(
      params.runtimeClient, params.canonicalJsonAuditor,
      ordinaryNoSignal,
      "NO_SIGNAL",
      "ordinary_not_required",
    );
    const historical = await params.createFixture("COMPLETED", 21, {
      githubEvidenceMode: "historical_unavailable",
    });
    assert(
      (await params.publish(readerSummaryPublicationDbOwnedRequest(historical))) === "published",
      "authorized historical evidence must publish",
    );
    await assertReaderSummaryWeeklyPublicationEvidenceRow(
      params.runtimeClient, params.canonicalJsonAuditor,
      historical,
      "COMPLETED",
      "historical_unavailable",
    );
    const verified = await params.createFixture("COMPLETED", 22, {
      githubEvidenceMode: "verified",
    });
    assert(
      (await params.publish(readerSummaryPublicationDbOwnedRequest(verified))) === "published",
      "verified exact GitHub board must publish",
    );
    await assertReaderSummaryWeeklyPublicationEvidenceRow(
      params.runtimeClient, params.canonicalJsonAuditor,
      verified,
      "COMPLETED",
      "verified",
    );
    const verifiedV2 = readerSummaryPublicationDbOwnedRequest(verified);
    assert(
      (await params.publish(verifiedV2)) === "replayed",
      "DB-owned exact evidence must replay",
    );
    await assertReplayHasZeroWrites(params.runtimeClient, verified, verifiedV2, params.publish);
    await assertSnapshotSurvivesSourceMutation(
      params.runtimeClient,
      verified,
      verifiedV2,
      params.publish,
    );
    await params.runtimeClient.query(
      `UPDATE reader_summary_jobs SET status = 'FAILED'
        WHERE id = $1`,
      [verified.jobId],
    );
    await assertRejects(
      () => params.publish(verifiedV2),
      "DB-owned replay must reject divergent terminal authority",
    );
    const wrongState = await params.createFixture("COMPLETED", 28, {
      githubEvidenceMode: "verified",
    });
    assert(wrongState.githubSourceBindingId !== undefined,
      "verified fixture must expose its exact source binding");
    await params.runtimeClient.query(
      `UPDATE source_bindings SET status = 'PAUSED'
        WHERE id = $1`,
      [wrongState.githubSourceBindingId],
    );
    await assertRejects(
      () => params.publish(wrongState.payload),
      "verified evidence with a wrong-state source binding must fail closed",
    );
    await params.assertNoPublication(wrongState);
    const noSignalWithCitation = await params.createFixture(
      "NO_SIGNAL",
      23,
      { providerEvidence: "rss" },
    );
    await assertRejects(
      () => params.publish(noSignalWithCitation.payload),
      "NO_SIGNAL with a provider citation must fail closed in PostgreSQL",
    );
    await params.assertNoPublication(noSignalWithCitation);
    const completedWithoutEvidence = await params.createFixture(
      "COMPLETED",
      24,
      { providerEvidence: "none" },
    );
    await assertRejects(
      () => params.publish(completedWithoutEvidence.payload),
      "COMPLETED without provider evidence must fail closed in PostgreSQL",
    );
    await params.assertNoPublication(completedWithoutEvidence);
    const completedOrdinary = await params.createFixture("COMPLETED", 25, {
      githubEvidenceMode: "ordinary_not_required",
    });
    await assertRejects(
      () => params.publish(completedOrdinary.payload),
      "ordinary GitHub mode must reject a COMPLETED publication",
    );
    await params.assertNoPublication(completedOrdinary);
    const noSignalVerified = await params.createFixture("NO_SIGNAL", 26, {
      githubEvidenceMode: "verified",
    });
    await assertRejects(
      () => params.publish(noSignalVerified.payload),
      "verified GitHub evidence must reject NO_SIGNAL",
    );
    await params.assertNoPublication(noSignalVerified);
    const unauthorizedHistorical = await params.createFixture(
      "NO_SIGNAL",
      27,
      { githubEvidenceMode: "historical_unavailable" },
    );
    await params.runtimeClient.query(
      `UPDATE reader_summary_artifacts
          SET quality_signals = jsonb_set(
            quality_signals,
            '{githubProjectionAudit}',
            (quality_signals->'githubProjectionAudit') - 'historicalOmission'
          )
        WHERE id = $1`,
      [unauthorizedHistorical.artifactId],
    );
    await assertRejects(
      () => params.publish(readerSummaryPublicationDbOwnedRequest(unauthorizedHistorical)),
      "historical mode without explicit authorization must fail closed",
    );
    await params.assertNoPublication(unauthorizedHistorical);
  };
const assertDbAuthorityAndJoinGuards = async (params: {
  readonly runtimeClient: PoolClient;
  readonly createFixture: (
    status: "COMPLETED" | "NO_SIGNAL",
    day: number,
    overrides?: EvidenceFixtureOverrides,
  ) => Promise<ReaderSummaryPublicationEvidenceFixture>;
  readonly publish: (
    payload: Readonly<Record<string, unknown>>,
  ) => Promise<string>;
  readonly assertNoPublication: (
    fixture: ReaderSummaryPublicationEvidenceFixture,
  ) => Promise<void>;
}): Promise<void> => {
  const authoritative = await params.createFixture("COMPLETED", 30);
  const storedAuthority = await params.runtimeClient.query<{ readonly has_publication_generation: boolean }>(
    `UPDATE reader_summary_artifacts
        SET headline = 'Database authoritative title',
            summary_text = 'Database authoritative text',
            artifact_payload = jsonb_set(jsonb_set(artifact_payload, '{headline}',
              '"Database authoritative title"'::jsonb), '{executiveSummary}',
              '"Database authoritative text"'::jsonb)
      WHERE id = $1
      RETURNING quality_signals ? 'publicationGeneration' AS has_publication_generation`,
    [authoritative.artifactId],
  );
  assert(storedAuthority.rows[0]?.has_publication_generation === false,
    "real persisted quality signals must not pre-seed publication generation");
  const lateRequestedAt = new Date(Date.parse(
    String(authoritative.payload.periodEndedAt)) + 20 * 60_000).toISOString();
  await params.runtimeClient.query(
    `UPDATE reader_summary_jobs SET requested_at = $2, started_at = $2 WHERE id = $1`,
    [authoritative.jobId, lateRequestedAt],
  );
  assert(
    (await params.publish(readerSummaryPublicationDbOwnedRequest(authoritative))) === "published",
    "DB-owned report authority must publish",
  );
  const report = await params.runtimeClient.query<{ readonly clock_honest: boolean;
    readonly headline: string; readonly requested_at: string;
    readonly requested_utc_date: string; readonly summary_text: string }>(
    `SELECT report->>'headline' AS headline,
            report->>'summaryText' AS summary_text,
            evidence.exact_proof->>'requestedUtcDate' AS requested_utc_date,
            evidence.exact_proof->>'requestedAt' AS requested_at,
            publication.published_at >= publication.requested_at AS clock_honest
       FROM reader_summary_weekly_publication_evidence evidence
       JOIN reader_summary_publications publication ON publication.id = evidence.publication_id
      WHERE evidence.publication_id = $1`,
    [authoritative.artifactId],
  );
  assertDeepEqual(
    report.rows[0],
    {
      headline: "Database authoritative title",
      summary_text: "Database authoritative text",
      requested_utc_date: String(authoritative.payload.periodStartedAt).slice(0, 10),
      requested_at: lateRequestedAt,
      clock_honest: true,
    },
    "caller report title or text displaced DB authority",
  );
  const crossTenant = await params.createFixture("COMPLETED", 31);
  await assertRejects(
    () =>
      params.publish({
        ...readerSummaryPublicationDbOwnedRequest(crossTenant),
        tenantId: "00000000-0000-4000-8000-000000000099",
      }),
    "cross-tenant V2 locator must fail closed",
  );
  await params.assertNoPublication(crossTenant);
  const nestedScope = await params.createFixture("NO_SIGNAL", 37,
    { publicationInterestId: randomUUID() });
  const otherInterestId = randomUUID();
  await params.runtimeClient.query(
    `INSERT INTO interests (id, tenant_id, workspace_id, name, query, status, created_at, updated_at)
     SELECT $2, tenant_id, workspace_id, 'Other valid publication interest',
            'nested authority regression', 'ENABLED', requested_at, requested_at
       FROM reader_summary_jobs WHERE id = $1`,
    [nestedScope.jobId, otherInterestId],
  );
  await params.runtimeClient.query(
    `UPDATE reader_summary_artifacts SET artifact_payload = jsonb_set(artifact_payload, '{scope}',
       jsonb_build_object('type', 'interest', 'interestId', $2::text)) WHERE id = $1`,
    [nestedScope.artifactId, otherInterestId],
  );
  await assertRejects(() => params.publish(readerSummaryPublicationDbOwnedRequest(nestedScope)),
    "nested artifact scope must not override the locked job/artifact scope", "reader summary V2 pre-evidence authority is invalid");
  await params.assertNoPublication(nestedScope);
  const mutations = [
    `UPDATE reader_summary_artifacts SET scope_key = 'forged-scope' WHERE id = $1`,
    `UPDATE reader_summary_artifacts SET period_started_at = period_started_at + interval '1 day' WHERE id = $1`,
    `UPDATE feed_items SET source_binding_id = gen_random_uuid() WHERE id = (SELECT (citation->>'feedItemId')::uuid FROM reader_summary_artifacts, jsonb_array_elements(citations) citation WHERE reader_summary_artifacts.id = $1 LIMIT 1)`,
    `UPDATE reader_summary_artifacts SET citations = citations || (citations->0), artifact_payload = jsonb_set(artifact_payload, '{citationMap}', citations || (citations->0)) WHERE id = $1`,
    `UPDATE reader_summary_artifacts SET artifact_payload = jsonb_set(artifact_payload, '{period,startedAt}', '"2030-01-01T00:00:00.000Z"') WHERE id = $1`,
    `UPDATE reader_summary_artifacts SET artifact_payload = jsonb_set(artifact_payload, '{lineage,modelVersion}', '"forged:model"') WHERE id = $1`,
    `UPDATE reader_summary_artifacts SET artifact_payload = jsonb_set(artifact_payload, '{lineage,promptVersion}', '"forged:prompt"') WHERE id = $1`,
    `UPDATE reader_summary_artifacts SET artifact_payload = jsonb_set(artifact_payload, '{headline}', '"Nested forged headline"') WHERE id = $1`,
    `UPDATE reader_summary_artifacts SET artifact_payload = jsonb_set(artifact_payload, '{executiveSummary}', '"Nested forged summary"') WHERE id = $1`,
  ] as const;
  for (const [index, mutation] of mutations.entries()) {
    const fixture = await params.createFixture("COMPLETED", 38 + index);
    await params.runtimeClient.query(mutation, [fixture.artifactId]);
    await assertRejects(
      () => params.publish(readerSummaryPublicationDbOwnedRequest(fixture)),
      "top-level or nested DB-authority mutation must fail closed", index >= 4 ? "reader summary V2 pre-evidence authority is invalid" : undefined,
    );
    await params.assertNoPublication(fixture);
  }
  const crossInterest = await params.createFixture("COMPLETED", 36, {
    githubEvidenceMode: "verified",
    publicationInterestId: randomUUID(),
  });
  await assertRejects(() => params.publish(
    readerSummaryPublicationDbOwnedRequest(crossInterest)),
  "interest publication must reject evidence from another interest",
  "weekly publication source authority is incomplete");
  await params.assertNoPublication(crossInterest);
};
export const assertReaderSummaryWeeklyPublicationEvidenceRow = async (
  runtimeClient: PoolClient,
  canonicalJsonAuditor: PoolClient,
  fixture: ReaderSummaryPublicationEvidenceFixture,
  status: "COMPLETED" | "NO_SIGNAL",
  githubMode: ReaderSummaryPublicationGitHubEvidenceMode =
    status === "NO_SIGNAL"
      ? "ordinary_not_required"
      : "historical_unavailable",
): Promise<void> => {
  const result = await runtimeClient.query<{
    readonly artifact_id: string;
    readonly canonical_bytes: Buffer;
    readonly stored_canonical_matches: boolean;
    readonly canonical_record: Readonly<Record<string, unknown>>;
    readonly canonical_sha256: string;
    readonly exact_proof: unknown;
    readonly github_count: number;
    readonly github_evidence: ReaderSummaryWeeklyPublicationGitHubEvidence;
    readonly github_mode: string;
    readonly github_repositories: number;
    readonly job_id: string;
    readonly period: ReaderSummaryWeeklyDailyPeriod;
    readonly provider_count: number;
    readonly provider_counts: unknown;
    readonly provider_evidence: readonly ReaderSummaryWeeklyPublicationProviderEvidence[];
    readonly publication_id: string;
    readonly published_at: string;
    readonly report: Readonly<Record<string, unknown>>;
    readonly report_citation_count: number;
    readonly requested_utc_date: string;
    readonly row_count: string;
    readonly scope: ReaderSummaryWeeklyManifestScope;
    readonly semantic_status: "COMPLETED" | "NO_SIGNAL";
    readonly tenant_id: string;
    readonly workspace_id: string;
  }>(
    `SELECT count(*) OVER ()::text AS row_count,
            publication_id::text, tenant_id::text, workspace_id::text,
            reader_summary_job_id::text AS job_id,
            reader_summary_artifact_id::text AS artifact_id,
            semantic_status::text, report, exact_proof, provider_evidence,
            github_evidence, canonical_record, canonical_bytes,
            btrim(canonical_sha256) AS canonical_sha256,
            canonical_record->'scope' AS scope,
            canonical_record->'period' AS period,
            to_char(requested_utc_date, 'YYYY-MM-DD')
              AS requested_utc_date,
            to_char(recorded_at AT TIME ZONE 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS published_at,
            jsonb_array_length(provider_evidence) AS provider_count,
            jsonb_array_length(report->'citations') AS report_citation_count,
            github_evidence->>'mode' AS github_mode,
            (github_evidence->>'evidenceCount')::integer AS github_count,
            jsonb_array_length(github_evidence->'repositories')
              AS github_repositories,
            canonical_record->'providerCounts' AS provider_counts,
            canonical_sha256 = encode(sha256(canonical_bytes), 'hex')
            AND identity =
              'reader_summary.weekly_publication_evidence.v1:' ||
              canonical_sha256 AS stored_canonical_matches
       FROM reader_summary_weekly_publication_evidence
      WHERE reader_summary_job_id = $1
        AND reader_summary_artifact_id = $2`,
    [fixture.jobId, fixture.artifactId],
  );
  const expectedProviderCount =
    githubMode === "verified" ? 10 : status === "COMPLETED" ? 1 : 0;
  const expectedProviderCounts = [
    {
      providerKey: "github-trending-page",
      count: githubMode === "verified" ? 10 : 0,
    },
    { providerKey: "hacker-news", count: 0 },
    { providerKey: "reddit", count: 0 },
    {
      providerKey: "rss",
      count: githubMode === "verified" ? 0 : expectedProviderCount,
    },
    { providerKey: "x-twitter", count: 0 },
  ];
  const row = result.rows[0];
  assert(row !== undefined, `${status} publication evidence row is missing`);
  const postgresCanonical = await canonicalJson(canonicalJsonAuditor, row.canonical_record);
  const jsEvidence = deriveReaderSummaryWeeklyPublicationEvidence({
    tenantId: row.tenant_id,
    workspaceId: row.workspace_id,
    scope: row.scope,
    period: row.period,
    requestedUtcDate: row.requested_utc_date,
    publicationId: row.publication_id,
    artifactId: row.artifact_id,
    jobId: row.job_id,
    semanticStatus: row.semantic_status,
    report: row.report,
    exactProof: row.exact_proof,
    artifactPayload: row.report.artifactPayload,
    providerEvidence: row.provider_evidence,
    githubEvidence: row.github_evidence,
    publishedAt: row.published_at,
  });
  assert(
    row.row_count === "1" &&
      row.provider_count === expectedProviderCount &&
      row.report_citation_count === expectedProviderCount &&
      row.github_mode === githubMode &&
      row.github_count === (githubMode === "verified" ? 10 : 0) &&
      row.github_repositories === (githubMode === "verified" ? 10 : 0) &&
      row.stored_canonical_matches &&
      postgresCanonical === jsEvidence.canonicalJson &&
      row.canonical_sha256 === jsEvidence.sha256 &&
      row.canonical_bytes.compare(Buffer.from(jsEvidence.toBytes())) === 0 &&
      stableJson(row.canonical_record) === jsEvidence.canonicalJson &&
      stableJson(row.provider_counts) === stableJson(expectedProviderCounts),
    `${status} publication evidence row is not exact`,
  );
  for (const item of row.provider_evidence) {
    assertDeepEqual(
      Object.keys(item).sort(),
      [
        "canonicalUrl", "citationField", "citationId", "feedItemId",
        "observedAt", "providerItemId", "providerKey", "publishedAt",
        "sourceBindingId", "sourceContentHash", "sourceItemId", "sourceText",
        "title",
      ],
      "provider evidence must contain the exact DB-owned field set",
    );
  }
};
const assertReplayHasZeroWrites = async (
  client: PoolClient,
  fixture: ReaderSummaryPublicationEvidenceFixture,
  request: Readonly<Record<string, unknown>>,
  publish: (payload: Readonly<Record<string, unknown>>) => Promise<string>,
): Promise<void> => {
  const state = async (): Promise<unknown> => (
    await client.query(
        `SELECT publication.xmin::text AS publication_xmin,
                evidence.xmin::text AS evidence_xmin,
                slot.xmin::text AS slot_xmin,
                (SELECT count(*)::text FROM outbox_events
                  WHERE correlation_id = $1::text) AS outbox_count
           FROM reader_summary_publications publication
           JOIN reader_summary_weekly_publication_evidence evidence
             ON evidence.publication_id = publication.id
           JOIN reader_summary_publication_slots slot
             ON slot.current_publication_id = publication.id
          WHERE publication.reader_summary_job_id = $2::uuid`,
      [fixture.jobId, fixture.jobId],
    )
  ).rows[0];
  const before = await state();
  assert(
    (await publish(request)) === "replayed",
    "weekly evidence replay must be semantic",
  );
  assertDeepEqual(
    await state(),
    before,
    "weekly evidence replay must perform zero durable writes",
  );
};
const assertSnapshotSurvivesSourceMutation = async (
  client: PoolClient,
  fixture: ReaderSummaryPublicationEvidenceFixture,
  request: Readonly<Record<string, unknown>>,
  publish: (payload: Readonly<Record<string, unknown>>) => Promise<string>,
): Promise<void> => {
  const snapshot = async (): Promise<unknown> => (
    await client.query(
        `SELECT encode(canonical_bytes, 'hex') AS canonical_bytes,
                btrim(canonical_sha256) AS canonical_sha256,
                provider_evidence
           FROM reader_summary_weekly_publication_evidence
          WHERE reader_summary_job_id = $1`,
      [fixture.jobId],
    )
  ).rows[0];
  const before = await snapshot();
  await client.query(
    `UPDATE source_items source
        SET title = 'mutated after publication',
            body = 'mutated source body',
            provider_item_id = provider_item_id || ':mutated',
            content_hash = repeat('f', 64)
       FROM reader_summary_weekly_publication_evidence evidence,
            jsonb_array_elements(evidence.provider_evidence) item
      WHERE evidence.reader_summary_job_id = $1
        AND source.id = (item->>'sourceItemId')::uuid`,
    [fixture.jobId],
  );
  await client.query(
    `UPDATE feed_items feed
        SET title = 'mutated after publication',
            body_preview = 'mutated feed preview',
            published_at = published_at + interval '1 second',
            observed_at = observed_at + interval '1 second'
       FROM reader_summary_weekly_publication_evidence evidence,
            jsonb_array_elements(evidence.provider_evidence) item
      WHERE evidence.reader_summary_job_id = $1
        AND feed.id = (item->>'feedItemId')::uuid`,
    [fixture.jobId],
  );
  assert(
    (await publish(request)) === "replayed",
    "source/feed mutation must not change semantic replay",
  );
  assertDeepEqual(
    await snapshot(),
    before,
    "source/feed mutation changed immutable publication evidence",
  );
  await assertRejects(
    () =>
      client.query(
        `UPDATE reader_summary_weekly_publication_evidence
            SET canonical_record = '{}'::jsonb
          WHERE reader_summary_job_id = $1`,
        [fixture.jobId],
      ),
    "canonical snapshot tamper must be rejected",
  );
  await assertRejects(
    () =>
      client.query(
        `UPDATE reader_summary_artifacts SET headline = 'tampered'
          WHERE id = $1`,
        [fixture.artifactId],
      ),
    "published report authority tamper must be rejected",
  );
};
export const readerSummaryPublicationDbOwnedRequest = (
  fixture: ReaderSummaryPublicationEvidenceFixture,
): Readonly<Record<string, unknown>> => ({
  schemaVersion: "reader_summary.publication_command.v2",
  tenantId: fixture.payload.tenantId,
  workspaceId: fixture.payload.workspaceId,
  readerSummaryJobId: fixture.jobId,
  readerSummaryArtifactId: fixture.artifactId,
});
export const canonicalObject = (
  value: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> =>
  JSON.parse(stableJson(value)) as Readonly<Record<string, unknown>>;
export const stableJson = (value: unknown): string =>
  JSON.stringify(canonicalValue(value));
export const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");
type FixtureAuthorityParams = Parameters<
  typeof createReaderSummaryPublicationFixtureAuthority
>[0];
const createRssCitation = async (
  params: FixtureAuthorityParams,
): Promise<Readonly<Record<string, unknown>>> => {
  const sourceItemId = randomUUID();
  const feedItemId = randomUUID();
  const sourceBindingId = randomUUID();
  const canonicalUrl = `https://example.test/publication/${sourceItemId}`;
  await params.client.query(
    `INSERT INTO source_items (
       id, tenant_id, workspace_id, source_binding_id, provider_key,
       provider_item_id, canonical_url, title, body, published_at,
       content_hash, observed_at, metadata
     ) VALUES (
       $1, $2, $3, $4, 'rss', $5, $6, 'Publication evidence',
       'Exact provider evidence body.', $7, $8, $7, '{}'::jsonb
     )`,
    [sourceItemId, params.tenantId, params.workspaceId, sourceBindingId,
      `publication-provider:${sourceItemId}`, canonicalUrl, params.requestedAt,
      "a".repeat(64)],
  );
  await params.client.query(
    `INSERT INTO feed_items (
       id, tenant_id, workspace_id, interest_id, source_item_id,
       source_binding_id, provider_key, dedupe_key, canonical_url, title,
       body_preview, published_at, observed_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, 'rss', $7, $8,
       'Publication evidence', 'Exact provider evidence body.',
       $9, $9, $9
     )`,
    [feedItemId, params.tenantId, params.workspaceId, randomUUID(),
      sourceItemId, sourceBindingId, `publication-feed:${feedItemId}`,
      canonicalUrl, params.requestedAt],
  );
  return {
    citationId: randomUUID(),
    field: "title",
    feedItemId,
    sourceItemId,
    providerKey: "rss",
    canonicalUrl,
  };
};
const createVerifiedGitHubAuthority = async (
  params: FixtureAuthorityParams,
): Promise<ReaderSummaryPublicationFixtureAuthority> => {
  const sourceBindingId = randomUUID();
  const scanJobId = randomUUID();
  const interestId = randomUUID();
  const checkedAt = new Date(
    Date.parse(params.startedAt) + 12 * 60 * 60 * 1_000,
  ).toISOString();
  const fetchStartedAt = new Date(
    Date.parse(checkedAt) - 60_000,
  ).toISOString();
  const observedAt = new Date(Date.parse(checkedAt) + 300_000).toISOString();
  const providerContentHash = "b".repeat(64);
  const catalog = await params.client.query<{ readonly id: string }>(
    `SELECT id::text FROM source_catalog_entries
      WHERE provider_key = 'github-trending-page'`,
  );
  const sourceCatalogEntryId = catalog.rows[0]?.id ?? randomUUID();
  if (catalog.rows[0] === undefined) {
    await params.client.query(
      `INSERT INTO source_catalog_entries (
         id, provider_key, display_name, acquisition_mode, readiness,
         created_at, updated_at
       ) VALUES (
         $1, 'github-trending-page', 'GitHub Trending', 'pull', 'ready',
         $2, $2
       )`,
      [sourceCatalogEntryId, params.startedAt],
    );
  }
  await params.client.query(
    `INSERT INTO interests (
       id, tenant_id, workspace_id, name, query, status, created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, 'github trending daily', 'ENABLED', $5, $5
     )`,
    [interestId, params.tenantId, params.workspaceId,
      `Publication evidence ${sourceBindingId}`, params.startedAt],
  );
  await params.client.query(
    `INSERT INTO source_bindings (
       id, tenant_id, workspace_id, interest_id, source_catalog_entry_id,
       capability_profile_version, status, config, created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, 1, 'ENABLED',
       '{"window":"daily"}'::jsonb, $6, $6
     )`,
    [sourceBindingId, params.tenantId, params.workspaceId, interestId,
      sourceCatalogEntryId, params.startedAt],
  );
  await params.client.query(
    `INSERT INTO scan_jobs (
       id, tenant_id, workspace_id, source_binding_id, scan_policy_id,
       status, idempotency_key, requested_at, completed_at, created_at,
       updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, 'SUCCEEDED', $6, $7, $8, $7, $8
     )`,
    [scanJobId, params.tenantId, params.workspaceId, sourceBindingId,
      randomUUID(), `publication-github-scan:${scanJobId}`, fetchStartedAt,
      observedAt],
  );
  const bindings: Readonly<Record<string, unknown>>[] = [];
  const citations: Readonly<Record<string, unknown>>[] = [];
  const selectedPosts: Readonly<Record<string, unknown>>[] = [];
  for (let index = 0; index < 10; index += 1) {
    const rank = index + 1;
    const sourceItemId = randomUUID();
    const feedItemId = randomUUID();
    const citationId = randomUUID();
    const repositoryIdentity = `owner/repository-${rank}`;
    const canonicalUrl = `https://github.com/${repositoryIdentity}`;
    const sourceContentHash = createHash("sha256")
      .update(`github-source-${rank}`)
      .digest("hex");
    const metadata = {
      kind: "github_trending_page_repository",
      repository: { fullName: repositoryIdentity },
      trending: {
        scanJobId,
        rank,
        starsGained: 200 + rank,
        window: "daily",
        fetchStartedAt,
        checkedAt,
      },
    };
    await params.client.query(
      `INSERT INTO source_items (
         id, tenant_id, workspace_id, source_binding_id, provider_key,
         provider_item_id, canonical_url, title, body, published_at,
         content_hash, provider_content_hash, observed_at, metadata
       ) VALUES (
         $1, $2, $3, $4, 'github-trending-page', $5, $6, $7, $8,
         $9, $10, $11, $12, $13::jsonb
       )`,
      [sourceItemId, params.tenantId, params.workspaceId, sourceBindingId,
        `github-trending:${scanJobId}:${rank}`, canonicalUrl,
        repositoryIdentity, `Repository ${rank} on the exact board.`,
        checkedAt, sourceContentHash, providerContentHash, observedAt,
        JSON.stringify(metadata)],
    );
    await params.client.query(
      `INSERT INTO feed_items (
         id, tenant_id, workspace_id, interest_id, source_item_id,
         source_binding_id, provider_key, dedupe_key, canonical_url, title,
         body_preview, published_at, observed_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, 'github-trending-page', $7, $8,
         $9, $10, $11, $12, $12
       )`,
      [feedItemId, params.tenantId, params.workspaceId, interestId,
        sourceItemId, sourceBindingId,
        `github-publication-feed:${feedItemId}`, canonicalUrl,
        repositoryIdentity, `Repository ${rank} on the exact board.`,
        checkedAt, observedAt],
    );
    await params.client.query(
      `INSERT INTO github_repository_trend_results (
         id, tenant_id, workspace_id, interest_id, source_binding_id,
         scan_job_id, source_item_id, repository_full_name, repository_url,
         primary_window, rank, checked_at, observed_at, source, metadata
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, 'daily', $10,
         $11, $12, 'github-trending-page', '{}'::jsonb
       )`,
      [randomUUID(), params.tenantId, params.workspaceId, interestId,
        sourceBindingId, scanJobId, sourceItemId, repositoryIdentity,
        canonicalUrl, rank, checkedAt, observedAt],
    );
    citations.push({
      citationId,
      field: "canonicalUrl",
      feedItemId,
      sourceItemId,
      providerKey: "github-trending-page",
      canonicalUrl,
    });
    selectedPosts.push({
      providerKey: "github-trending-page",
      canonicalUrl,
      citationIds: [citationId],
    });
    bindings.push({
      selectedPostIndex: index,
      rank,
      citationId,
      feedItemId,
      sourceItemId,
      sourceBindingId,
      providerKey: "github-trending-page",
      metadataKind: "github_trending_page_repository",
      scanJobId,
      repositoryIdentity,
      canonicalUrl,
      starsGained: 200 + rank,
      fetchStartedAt,
      publishedAt: checkedAt,
      checkedAt,
      observedAt,
      sourceContentHash,
      sourceProviderContentHash: providerContentHash,
    });
  }
  return {
    citations,
    content: { selectedPosts },
    githubSourceBindingId: sourceBindingId,
    githubProjectionAudit: {
      schemaVersion: "reader_summary.github_projection.v1",
      status: "verified",
      requestedUtcDay: params.startedAt.slice(0, 10),
      pageCount: 1,
      scannedItemCount: 10,
      eligibleBindingIds: [sourceBindingId],
      observedThrough: observedAt,
      projectionCheckedAt: checkedAt,
      telemetry: buildReaderSummaryGitHubProjectionCollectionTelemetry({
        dayEndedAt: new Date(params.endedAt),
        observedAt: bindings.map(() => new Date(observedAt)),
      }),
      bindings,
      violationCodes: [],
      reasons: [],
    },
  };
};
const assertCanonicalJsonParityAndBounds = async (
  canonicalJsonAuditor: PoolClient,
): Promise<void> => {
  const parityValues = [
    null, true, "plain", 1e-7, 0.000001, 1e20, 1e21, 1.2345678901234567,
    {
      "\uE000": "private-use",
      "\u{10000}": "supplementary",
      nested: [null, false, { emoji: "🛰️", escaped: "\b\n\t" }],
    },
  ] as const;
  for (const value of parityValues) {
    const expected = canonicalizeReaderSummaryWeeklyJson(value).json;
    const actual = await canonicalJson(canonicalJsonAuditor, value);
    assert(
      actual === expected,
      `PostgreSQL canonical JSON diverged: expected ${expected}, got ${actual}`,
    );
  }
  const tooDeep = Array.from({ length: 25 }).reduce<unknown>(
    (value) => [value],
    null,
  );
  const tooManyArrayItems = Array.from({ length: 513 }, () => null); const tooManyObjectKeys = Object.fromEntries(
    Array.from({ length: 65 }, (_, index) => [`key-${index}`, null]));
  const tooLongString = "x".repeat(16_385);
  const tooManyBytes = Array.from({ length: 64 }, () =>
    Array.from({ length: 63 }, () => "x".repeat(300)),
  );
  for (const value of [tooDeep, tooManyArrayItems, tooManyObjectKeys,
    tooLongString, tooManyBytes]) {
    assertRejectsSync(
      () => canonicalizeReaderSummaryWeeklyJson(value),
      "JavaScript canonical JSON must enforce its published bounds",
    );
    await assertRejects(
      () => canonicalJson(canonicalJsonAuditor, value),
      "PostgreSQL canonical JSON must enforce JavaScript-equivalent bounds",
    );
  }
};
const assertCanonicalFunctionsAreHardened = async (
  canonicalJsonAuditor: PoolClient): Promise<void> => {
  const result = await canonicalJsonAuditor.query<{ readonly hardened_count: string; readonly semantics_constraint_count: string }>(
    `SELECT
       (SELECT count(*)::text
          FROM pg_proc procedure
         WHERE procedure.oid = ANY(ARRAY[
           'reader_summary_weekly_utf16_sort_key(text)'::regprocedure,
           'reader_summary_weekly_utf16_length(text)'::regprocedure,
           'reader_summary_weekly_canonical_number(jsonb)'::regprocedure,
           'reader_summary_weekly_canonical_json_unbounded(jsonb)'::regprocedure,
           'reader_summary_weekly_canonical_json(jsonb)'::regprocedure,
           'guard_reader_summary_weekly_publication_evidence()'::regprocedure,
           'record_reader_summary_weekly_publication_evidence_base(uuid)'::regprocedure,
           'record_reader_summary_daily_canonical_recovery_v4_evidence(uuid)'::regprocedure,
           'record_reader_summary_weekly_publication_evidence(uuid)'::regprocedure,
           'publish_reader_summary_legacy_v1(jsonb)'::regprocedure,
           'publish_reader_summary_pre_evidence(jsonb)'::regprocedure,
           'publish_reader_summary(jsonb)'::regprocedure
         ])
           AND procedure.proconfig = CASE WHEN procedure.proname IN (
             'record_reader_summary_daily_canonical_recovery_v4_evidence',
             'record_reader_summary_weekly_publication_evidence'
           ) THEN ARRAY['search_path=pg_catalog']::text[]
           ELSE ARRAY['search_path=pg_catalog, public, pg_temp']::text[] END)
         AS hardened_count,
       (SELECT count(*)::text
          FROM pg_constraint constraint_row
         WHERE constraint_row.conrelid =
           'reader_summary_weekly_publication_evidence'::regclass
           AND constraint_row.conname =
             'reader_summary_weekly_publication_evidence_semantics_check'
           AND constraint_row.contype = 'c'
           AND constraint_row.convalidated) AS semantics_constraint_count`,
  );
  assert(
    result.rows[0]?.hardened_count === "12" &&
      result.rows[0]?.semantics_constraint_count === "1",
    "publication evidence functions or semantic constraint are not hardened",
  );
};
const canonicalJson = async (
  canonicalJsonAuditor: PoolClient,
  value: unknown,
): Promise<string> => {
  const result = await canonicalJsonAuditor.query<{ readonly canonical: string }>(
    `SELECT reader_summary_weekly_canonical_json($1::jsonb) AS canonical`,
    [JSON.stringify(value)],
  );
  const canonical = result.rows[0]?.canonical;
  if (canonical === undefined) {
    throw new Error("PostgreSQL canonical JSON returned no exact row");
  }
  return canonical;
};
const canonicalValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(canonicalValue);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter((entry) => entry[1] !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, child]) => [key, canonicalValue(child)]),
    );
  }
  return value;
};
const assertRejects = async (
  operation: () => Promise<unknown>,
  message: string,
  expectedMessage?: string,
): Promise<void> => {
  try {
    await operation();
  } catch (error: unknown) {
    if (expectedMessage === undefined ||
      (error instanceof Error && error.message.includes(expectedMessage))) return;
    throw new Error(message);
  }
  throw new Error(message);
};
const assertRejectsSync = (
  operation: () => unknown,
  message: string,
): void => {
  try {
    operation();
  } catch {
    return;
  }
  throw new Error(message);
};
const assertDeepEqual = (
  actual: unknown,
  expected: unknown,
  message: string,
): void => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(message);
  }
};
const assert: (condition: boolean, message: string) => asserts condition = (
  condition,
  message,
) => {
  if (!condition) {
    throw new Error(message);
  }
};
