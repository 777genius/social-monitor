import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { ReaderSummaryArtifact } from "../../libs/summary/domain";
import type { ReaderSummaryPublicationRunningFixture } from
  "./reader-summary-publication-postgres-running-fixture";
import { assertPostgres as assert, assertPostgresRejects as assertRejects,
  assertPostgresRejectsContaining as assertRejectsContaining } from
  "./reader-summary-publication-postgres-assertions";

type Payload = Record<string, unknown> & {
  tenantId: string; workspaceId: string; reportCanonical: string;
  reportSha256: string;
  periodStartedAt: string; periodEndedAt: string; periodTimezone: string;
  periodKey: string; readerSummaryArtifactId: string;
  report: { artifactPayload: { citationMap: Array<{ sourceItemId: string }> } };
  exactProof: { period: Record<string, unknown> };
  readyEvent: { payload: { period: Record<string, unknown> } };
};

export const assertV3LongSourcePostgresContract = async (params: {
  readonly client: PoolClient;
  readonly adminClient: PoolClient;
  readonly createFixture: (status: "COMPLETED", day: number, overrides: {
    readonly publicationInterestId: string;
    readonly providerEvidence: "rss";
    readonly providerPublishedAt: string;
    readonly providerObservedAt: string;
    readonly payloadTransform: (payload: Readonly<Record<string, unknown>>) =>
      Promise<{ readonly payload: Readonly<Record<string, unknown>>;
        readonly applicationArtifact?: ReaderSummaryArtifact }>;
  }) => Promise<ReaderSummaryPublicationRunningFixture>;
  readonly build: (payload: Readonly<Record<string, unknown>>) => Promise<{
    readonly payload: Readonly<Record<string, unknown>>;
    readonly applicationArtifact?: ReaderSummaryArtifact }>;
  readonly advance: (fixture: ReaderSummaryPublicationRunningFixture) => Promise<unknown>;
  readonly publish: (fixture: ReaderSummaryPublicationRunningFixture,
    payload: Readonly<Record<string, unknown>>) => Promise<string>;
}): Promise<void> => {
  const day = 27;
  const body = "Captured source, unchanged. ".repeat(1_000);
  assert(body.length > 16_384 && body.length < 64_000,
    "long-source regression must cross the legacy string limit");
  const fixture = await params.createFixture("COMPLETED", day, {
    publicationInterestId: randomUUID(), providerEvidence: "rss",
    providerPublishedAt: "2026-06-27T09:00:00.123456Z",
    providerObservedAt: "2026-06-27T09:01:00.123456Z",
    payloadTransform: async (source) => {
      const payload = JSON.parse(JSON.stringify(source)) as Payload;
      const sourceItemId = payload.report.artifactPayload.citationMap[0]?.sourceItemId;
      assert(sourceItemId !== undefined, "long-source fixture needs a source item");
      await params.client.query("UPDATE source_items SET body=$2 WHERE id=$1::uuid",
        [sourceItemId, body]);
      const timezone = "Etc/GMT";
      const periodKey = `daily:${payload.periodStartedAt}:${payload.periodEndedAt}:${timezone}`;
      payload.periodTimezone = timezone;
      payload.periodKey = periodKey;
      payload.exactProof.period.timezone = timezone;
      payload.exactProof.period.periodKey = periodKey;
      payload.readyEvent.payload.period.timezone = timezone;
      payload.readyEvent.payload.period.periodKey = periodKey;
      await params.client.query(`UPDATE reader_summary_jobs
        SET period_timezone=$2, period_key=$3 WHERE id=$1::uuid`,
        [source.readerSummaryJobId, timezone, periodKey]);
      return params.build(payload);
    },
  });
  const payload = fixture.payload as Payload;
  await params.client.query(`UPDATE reader_summary_artifacts
    SET period_timezone=$2, period_key=$3 WHERE id=$1::uuid`,
    [fixture.artifactId, payload.periodTimezone, payload.periodKey]);
  await params.advance(fixture);
  assert(await params.publish(fixture, fixture.payload) === "published",
    "long V3 captured source must publish outside UTC daily");
  assert(await params.publish(fixture, fixture.payload) === "replayed",
    "long V3 captured source must replay exactly");
  const published = (await params.client.query<{
    readonly body: string; readonly timezone: string }>(
    `SELECT a.artifact_payload #>> '{content,topReads,0,capturedSource,body}' AS body,
        p.period_timezone AS timezone
      FROM reader_summary_publications p JOIN reader_summary_artifacts a
        ON a.id=p.reader_summary_artifact_id
      WHERE p.reader_summary_job_id=$1::uuid`, [fixture.jobId])).rows[0];
  assert(published?.body === body, "publication changed the signed source body");
  assert(published?.timezone === "Etc/GMT",
    "long-source regression must publish outside UTC daily");
  const tampered = JSON.parse(JSON.stringify(fixture.payload)) as Payload;
  const card = (tampered.report.artifactPayload as Record<string, unknown>)
    .content as { topReads: Array<{ capturedSource: { body: string } }> };
  card.topReads[0]!.capturedSource.body += " tampered";
  await assertRejects(() => params.publish(fixture, tampered),
    "changed source after publication must reject");
  await assertRejectsContaining(() => params.client.query(
    `SELECT public.reader_summary_v3_publication_canonical_json(
      to_jsonb('probe'::text), 'jev_primary_v3', 'weekly')`),
  "permission denied for function",
  "publication runtime must not execute the V3 canonical helper directly");

  await params.adminClient.query("BEGIN");
  try {
    await params.adminClient.query(
      'SET LOCAL ROLE "social_monitor_reader_summary_publication_owner"');
    const canonical = await params.adminClient.query<{ readonly value: string }>(
      `SELECT public.reader_summary_v3_publication_canonical_json(
        to_jsonb($1::text), 'jev_primary_v3', 'weekly') AS value`, [body]);
    assert(canonical.rows[0]?.value === JSON.stringify(body),
      "V3 canonicalization must preserve long source bytes");
    const utf16Limit = "🚀".repeat(32_000);
    const boundary = await params.adminClient.query<{ readonly value: string }>(
      `SELECT public.reader_summary_v3_publication_canonical_json(
        to_jsonb($1::text), 'jev_primary_v3', 'weekly') AS value`, [utf16Limit]);
    assert(boundary.rows[0]?.value === JSON.stringify(utf16Limit),
      "V3 canonicalization must admit exactly 64,000 UTF-16 units");
    await params.adminClient.query("SAVEPOINT legacy_bound");
    await assertRejectsContaining(() => params.adminClient.query(
      `SELECT public.reader_summary_v3_publication_canonical_json(
        to_jsonb($1::text), NULL, 'weekly')`, [body]),
    "weekly canonical JSON exceeds structural bounds",
    "legacy V2 canonical bound must remain 16,384 UTF-16 units");
    await params.adminClient.query("ROLLBACK TO SAVEPOINT legacy_bound");
    await params.adminClient.query("SAVEPOINT oversize");
    await assertRejectsContaining(() => params.adminClient.query(
      `SELECT public.reader_summary_v3_publication_canonical_json(
        to_jsonb($1::text), 'jev_primary_v3', 'weekly')`, [utf16Limit + "🚀"]),
    "V3 publication canonical JSON exceeds structural bounds",
    "V3 canonicalization must reject source beyond 64,000 UTF-16 units");
    await params.adminClient.query("ROLLBACK TO SAVEPOINT oversize");
    await params.adminClient.query("SAVEPOINT title_bound");
    await assertRejectsContaining(() => params.adminClient.query(
      `SELECT public.reader_summary_v3_publication_canonical_json(
        jsonb_build_object('schemaVersion','reader_summary.artifact.v1',
          'content',jsonb_build_object('additionalPosts',jsonb_build_array(
            jsonb_build_object('capturedSource',jsonb_build_object(
              'title',$1::text,'body','source'))))),
        'jev_primary_v3', 'artifact')`, ["T".repeat(2_001)]),
    "V3 captured source exceeds signed bounds",
    "V3 captured source title must remain bounded at 2,000 UTF-16 units");
    await params.adminClient.query("ROLLBACK TO SAVEPOINT title_bound");
    await params.adminClient.query("SAVEPOINT unsigned_source");
    await assertRejectsContaining(() => params.adminClient.query(
      `SELECT public.reader_summary_v3_publication_canonical_json(
        jsonb_build_object('schemaVersion','reader_summary.artifact.v1',
          'content',jsonb_build_object('topReads',jsonb_build_array(
            jsonb_build_object('capturedSource',jsonb_build_object(
              'title','source','body',$1::text))))),
        'jev_primary_v3', 'artifact')`, [body]),
    "long V3 publication requires a V3 promotion attestation",
    "long source without the V3 promotion contract must reject");
    await params.adminClient.query("ROLLBACK TO SAVEPOINT unsigned_source");
  } finally {
    await params.adminClient.query("ROLLBACK");
  }
  await assertUtcDailyV3LargeReport(params);
};

const assertUtcDailyV3LargeReport = async (
  params: Parameters<typeof assertV3LongSourcePostgresContract>[0],
): Promise<void> => {
  // Escaped controls make a bounded captured source large on the wire. The
  // fixture also carries source-sized editorial risks to exercise aggregate
  // report growth without changing its signed capture or PostgreSQL limits.
  const body = "\u001f".repeat(63_984) + "Captured source.";
  assert(body.length === 64_000, "large V3 capture must meet its UTF-16 bound");
  const fixture = await params.createFixture("COMPLETED", 28, {
    publicationInterestId: randomUUID(), providerEvidence: "rss",
    providerPublishedAt: "2026-06-28T09:00:00.123456Z",
    providerObservedAt: "2026-06-28T09:01:00.123456Z",
    payloadTransform: async (source) => {
      const payload = source as Payload;
      const sourceItemId = payload.report.artifactPayload.citationMap[0]?.sourceItemId;
      assert(sourceItemId !== undefined, "large V3 fixture needs a source item");
      await params.client.query("UPDATE source_items SET body=$2 WHERE id=$1::uuid",
        [sourceItemId, body]);
      return params.build(source);
    },
  });
  const payload = fixture.payload as Payload;
  assert(payload.periodTimezone === "UTC", "large V3 fixture must be UTC daily");
  const reportBytes = Buffer.byteLength(payload.reportCanonical, "utf8");
  assert(reportBytes > 4_194_304 && reportBytes < 16_777_216,
    `large V3 report must cross only the legacy 4 MiB limit: ${reportBytes}`);
  const command = {
    schemaVersion: "reader_summary.publication_command.v2",
    tenantId: fixture.payload.tenantId,
    workspaceId: fixture.payload.workspaceId,
    readerSummaryJobId: fixture.jobId,
    readerSummaryArtifactId: fixture.artifactId,
  };
  const initial = (await params.client.query<{ readonly strategy: string | null }>(
    `SELECT selection_strategy AS strategy FROM reader_summary_jobs
      WHERE id=$1::uuid`, [fixture.jobId])).rows[0];
  assert(initial?.strategy === null,
    "large report must begin with the legacy job selection strategy");
  await assertRejectsContaining(() => params.client.query(
    "SELECT outcome FROM public.publish_reader_summary($1::jsonb)",
    [JSON.stringify(command)]),
  "daily publication report exceeds byte bounds",
  "legacy UTC-daily publication must keep the 4 MiB bound");
  const afterRejection = (await params.client.query<{
    readonly status: string; readonly publications: string }>(
    `SELECT j.status::text, (SELECT count(*) FROM reader_summary_publications p
      WHERE p.reader_summary_job_id=j.id)::text AS publications
      FROM reader_summary_jobs j WHERE j.id=$1::uuid`, [fixture.jobId])).rows[0];
  assert(afterRejection !== undefined && afterRejection.status === "RUNNING" &&
    afterRejection.publications === "0",
    "legacy bound rejection must leave the candidate unpublished");
  await params.advance(fixture);
  assert(await params.publish(fixture, command) === "published",
    "UTC-daily V3 report above 4 MiB must publish through pre-evidence");
  assert(await params.publish(fixture, command) === "replayed",
    "UTC-daily V3 report above 4 MiB must replay through evidence");
  const stored = (await params.client.query<{ readonly body: string;
    readonly report_sha256: string }>(
    `SELECT a.artifact_payload #>> '{content,topReads,0,capturedSource,body}' AS body,
      p.report_sha256 FROM reader_summary_publications p
      JOIN reader_summary_artifacts a ON a.id=p.reader_summary_artifact_id
      WHERE p.reader_summary_job_id=$1::uuid`, [fixture.jobId])).rows[0];
  assert(stored !== undefined && stored.body === body &&
    stored.report_sha256 === payload.reportSha256,
    "large V3 publication must retain the signed source and report digest");
};
