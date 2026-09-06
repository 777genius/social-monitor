import { stablePublicationJson } from "@social-monitor/summary/adapters/persistence/reader-summary-publication-proof";
import { refreshBytesHash } from "./reader-summary-new-input-refresh-manifest";
import { verifyHistoricalPromotionArtifact, type HistoricalPromotionArtifactRecord } from "./reader-summary-promotion-v2-historical-artifact";
import type { PrismaSummaryClient } from
  "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-client";
import type { PrismaReaderSummaryClient } from
  "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-client";
import { refreshHash, refreshScope, refreshKeyPrefix, type RefreshPrior } from
  "./reader-summary-new-input-refresh-manifest";
import { assertHistoricalPromotionSystemRole } from "./reader-summary-promotion-v2-system-database";

type Client = Pick<PrismaSummaryClient, "$queryRaw">;
export async function readRefreshPrior(client: Client, date: string,
  publicationId?: string): Promise<RefreshPrior> {
  const rows = await client.$queryRaw<readonly (RefreshPrior & { valid: boolean; record: HistoricalPromotionArtifactRecord; report: unknown; proof: unknown })[]>`
    select p.id::text as "publicationId", a.id::text as "artifactId",
      j.id::text as "jobId", p.semantic_status::text as status,
      btrim(p.report_sha256) as "reportSha256", btrim(p.proof_sha256) as "proofSha256",
      encode(sha256(convert_to((to_jsonb(a) - 'status' - 'updated_at')::text, 'UTF8')), 'hex') as "artifactSha256",
      encode(sha256(convert_to(to_jsonb(j)::text, 'UTF8')), 'hex') as "jobSha256",
      encode(sha256(convert_to(to_jsonb(p)::text, 'UTF8')), 'hex') as "publicationSha256",
      a.artifact_payload->'sourceWindow'->>'ingestionCutoff' as "observedThrough",
      jsonb_array_length(coalesce(a.artifact_payload->'content'->'topReads', '[]')) as "topCount",
      jsonb_array_length(coalesce(a.artifact_payload->'content'->'selectedPosts', '[]')) as "additionalCount",
      jsonb_array_length(a.citations) as "citationCount",
      jsonb_build_object('artifactId', a.id, 'status', p.semantic_status,
        'tenantId', a.tenant_id, 'workspaceId', a.workspace_id, 'scopeType', a.scope_type,
        'interestId', a.interest_id, 'cadence', a.cadence, 'periodStartedAt', a.period_started_at,
        'periodEndedAt', a.period_ended_at, 'periodTimezone', a.period_timezone,
        'userId', a.user_id, 'subscriptionId', a.subscription_id, 'headline', a.headline,
        'summaryText', a.summary_text, 'createdAt', a.created_at, 'artifactPayload', a.artifact_payload) as record,
      jsonb_build_object('schemaVersion', 'reader_summary.publication_report.v1',
        'semanticStatus', p.semantic_status, 'modelVersion', a.model_version,
        'promptVersion', a.prompt_version, 'headline', a.headline, 'summaryText', a.summary_text,
        'artifactPayload', a.artifact_payload, 'citations', a.citations, 'qualitySignals', a.quality_signals) as report,
      p.exact_proof as proof,
      (j.status = p.semantic_status and j.reader_summary_artifact_id = a.id
        and a.tenant_id = p.tenant_id and a.workspace_id = p.workspace_id
        and j.tenant_id = p.tenant_id and j.workspace_id = p.workspace_id
        and a.scope_type = 'workspace' and a.scope_key = 'workspace'
        and j.scope_type = 'workspace' and j.scope_key = 'workspace'
        and a.interest_id is null and j.interest_id is null
        and a.user_id is null and j.user_id is null
        and a.subscription_id is null and j.subscription_id is null
        and a.cadence = 'daily' and j.cadence = 'daily'
        and a.period_started_at = p.period_started_at and j.period_started_at = p.period_started_at
        and a.period_ended_at = p.period_ended_at and j.period_ended_at = p.period_ended_at
        and a.period_timezone = 'UTC' and j.period_timezone = 'UTC'
        and p.publication_kind = 'EXACT'
        and p.exact_proof->>'readerSummaryArtifactId' = a.id::text
        and p.exact_proof->>'readerSummaryJobId' = j.id::text
        and p.exact_proof->>'tenantId' = p.tenant_id::text
        and p.exact_proof->>'workspaceId' = p.workspace_id::text
        and p.exact_proof->>'reportSha256' = btrim(p.report_sha256)
        and (case when ${publicationId ?? null}::uuid is null
          then a.status = p.semantic_status else a.status in (p.semantic_status, 'SUPERSEDED') end)
      ) as valid
    from reader_summary_publications p
    join reader_summary_artifacts a on a.id = p.reader_summary_artifact_id
    join reader_summary_jobs j on j.id = p.reader_summary_job_id
    where p.tenant_id = ${refreshScope.tenantId}::uuid
      and p.workspace_id = ${refreshScope.workspaceId}::uuid
      and p.scope_type = 'workspace' and p.scope_key = 'workspace'
      and p.cadence = 'daily' and p.period_timezone = 'UTC'
      and p.period_started_at = ${date}::date::timestamp at time zone 'UTC'
      and p.period_ended_at = (${date}::date + 1)::timestamp at time zone 'UTC'
      and (case when ${publicationId ?? null}::uuid is null then p.id = (
        select current_publication_id from reader_summary_publication_slots s
        where s.tenant_id = p.tenant_id and s.workspace_id = p.workspace_id
          and s.scope_type = p.scope_type and s.scope_key = p.scope_key
          and s.cadence = p.cadence and s.period_timezone = p.period_timezone
          and s.period_started_at = p.period_started_at and s.period_ended_at = p.period_ended_at
      ) else p.id = ${publicationId ?? null}::uuid end)
  `;
  if (rows.length !== 1 || rows[0]?.valid !== true) {
    throw new Error("Refresh requires an exact terminal canonical prior publication and job");
  }
  const { valid: _valid, record, report, proof, ...prior } = rows[0];
  void _valid;
  verifyHistoricalPromotionArtifact(record);
  for (const [value, hash] of [[report, prior.reportSha256], [proof, prior.proofSha256]]) {
    if (refreshBytesHash(Buffer.from(stablePublicationJson(value))) !== hash) {
      throw new Error("Refresh prior immutable report/proof digest is invalid");
    }
  }
  return { ...prior, observedThrough: new Date(prior.observedThrough).toISOString() };
}

/** Hash whole engagement rows, not feed metadata projections or admitted IDs. */
export async function readRefreshMutableAuthority(client: Client, date: string) {
  await assertHistoricalPromotionSystemRole(client);
  const rows = await client.$queryRaw<readonly {
    canonicalRowsSha256: string; engagementSha256: string; sourceScopeSha256: string; policySha256: string;
    metricRowCount: number;
  }[]>`
    with relevant as (
      select distinct source_item_id from feed_items
      where tenant_id = ${refreshScope.tenantId}::uuid
        and workspace_id = ${refreshScope.workspaceId}::uuid and status = 'VISIBLE'
        and published_at >= ${date}::date::timestamp at time zone 'UTC'
        and published_at < (${date}::date + 1)::timestamp at time zone 'UTC'
    ), canonical_rows as (
      select jsonb_build_array(to_jsonb(f), to_jsonb(s)) as row
      from feed_items f join source_items s on s.id = f.source_item_id
        and s.tenant_id = f.tenant_id and s.workspace_id = f.workspace_id
      where f.tenant_id = ${refreshScope.tenantId}::uuid
        and f.workspace_id = ${refreshScope.workspaceId}::uuid and f.status = 'VISIBLE'
        and f.published_at >= ${date}::date::timestamp at time zone 'UTC'
        and f.published_at < (${date}::date + 1)::timestamp at time zone 'UTC'
    ), metrics as (
      select 'snapshot' as kind, to_jsonb(s) as row from source_item_engagement_snapshots s
      where s.tenant_id = ${refreshScope.tenantId}::uuid
        and s.workspace_id = ${refreshScope.workspaceId}::uuid and source_item_id in (select * from relevant)
      union all
      select 'observation', to_jsonb(o) from source_item_engagement_observations o
      where o.tenant_id = ${refreshScope.tenantId}::uuid
        and o.workspace_id = ${refreshScope.workspaceId}::uuid and source_item_id in (select * from relevant)
      union all
      select 'rollup', to_jsonb(r) from source_item_engagement_daily_rollups r
      where r.tenant_id = ${refreshScope.tenantId}::uuid
        and r.workspace_id = ${refreshScope.workspaceId}::uuid and source_item_id in (select * from relevant)
    ), bindings as (
      select jsonb_build_array(to_jsonb(b), to_jsonb(i), to_jsonb(c)) as row
      from source_bindings b join interests i on i.id = b.interest_id
      join source_catalog_entries c on c.id = b.source_catalog_entry_id
      where b.tenant_id = ${refreshScope.tenantId}::uuid and b.workspace_id = ${refreshScope.workspaceId}::uuid
        and i.tenant_id = b.tenant_id and i.workspace_id = b.workspace_id
    ), policy as (
      select to_jsonb(p) as row from reader_summary_policies p
      where tenant_id = ${refreshScope.tenantId}::uuid and workspace_id = ${refreshScope.workspaceId}::uuid
        and scope_type = 'workspace' and scope_key = 'workspace' and interest_id is null
    )
    select encode(sha256(convert_to(coalesce((select jsonb_agg(row order by row::text)::text
      from canonical_rows), '[]'), 'UTF8')), 'hex') as "canonicalRowsSha256",
      encode(sha256(convert_to(coalesce((select jsonb_agg(jsonb_build_array(kind, row)
      order by kind, row::text)::text from metrics), '[]'), 'UTF8')), 'hex') as "engagementSha256",
      encode(sha256(convert_to(coalesce((select jsonb_agg(row order by row::text)::text
        from bindings), '[]'), 'UTF8')), 'hex') as "sourceScopeSha256",
      (select encode(sha256(convert_to(row::text, 'UTF8')), 'hex') from policy) as "policySha256",
      (select count(*)::int from metrics) as "metricRowCount"
  `;
  if (rows.length !== 1 || !rows[0]?.policySha256) throw new Error("Refresh policy is missing");
  return rows[0];
}

export type RefreshJobState = Readonly<{
  jobId: string; operation: string; status: string; artifactId: string | null;
}>;
export const readRefreshJobs = async (client: Client, date: string): Promise<readonly RefreshJobState[]> =>
  client.$queryRaw<readonly RefreshJobState[]>`
    select id::text as "jobId", idempotency_key as operation, status::text as status,
      reader_summary_artifact_id::text as "artifactId"
    from reader_summary_jobs where tenant_id = ${refreshScope.tenantId}::uuid
      and workspace_id = ${refreshScope.workspaceId}::uuid
      and starts_with(idempotency_key, ${refreshKeyPrefix(date)})
    order by id
  `;

export async function lockRefreshAuthority(client: Pick<PrismaReaderSummaryClient, "$queryRaw">): Promise<void> {
  if (!("$executeRaw" in client) || typeof client.$executeRaw !== "function") {
    throw new Error("Refresh requires a lock-capable publisher transaction");
  }
  const locking = client as PrismaReaderSummaryClient & {
    $executeRaw(query: TemplateStringsArray): Promise<number>;
  };
  // Match engagement projection's snapshot -> source -> feed direction. Other
  // writers use other orders: NOWAIT on EVERY relation prevents a lock cycle
  // while partially acquired locks are held. Failure aborts; never retry a model.
  await locking.$executeRaw`lock table source_item_engagement_snapshots,
    source_items, feed_items, source_item_engagement_observations,
    source_item_engagement_daily_rollups, source_bindings, interests,
    source_catalog_entries, reader_summary_policies in share mode nowait`;
}
export const sameRefreshAuthority = (a: unknown, b: unknown): boolean => refreshHash(a) === refreshHash(b);

export async function readRefreshCounts(client: Client, date: string) {
  const rows = await client.$queryRaw<readonly { publications: number; outbox: number; jobs: number; artifacts: number }[]>`
    select (select count(*)::int from reader_summary_publications p where p.tenant_id = ${refreshScope.tenantId}::uuid
      and p.workspace_id = ${refreshScope.workspaceId}::uuid and p.scope_key = 'workspace' and p.cadence = 'daily'
      and p.period_started_at = ${date}::date::timestamp at time zone 'UTC') as publications,
    (select count(*)::int from reader_summary_publications p join outbox_events e on e.id = p.outbox_event_id
      and e.tenant_id = p.tenant_id and e.workspace_id = p.workspace_id
      where p.tenant_id = ${refreshScope.tenantId}::uuid and p.workspace_id = ${refreshScope.workspaceId}::uuid
      and p.scope_key = 'workspace' and p.cadence = 'daily'
      and p.period_started_at = ${date}::date::timestamp at time zone 'UTC') as outbox,
    (select count(*)::int from reader_summary_jobs where tenant_id = ${refreshScope.tenantId}::uuid
      and workspace_id = ${refreshScope.workspaceId}::uuid and scope_key = 'workspace' and cadence = 'daily'
      and period_started_at = ${date}::date::timestamp at time zone 'UTC') as jobs,
    (select count(*)::int from reader_summary_artifacts where tenant_id = ${refreshScope.tenantId}::uuid
      and workspace_id = ${refreshScope.workspaceId}::uuid and scope_key = 'workspace' and cadence = 'daily'
      and period_started_at = ${date}::date::timestamp at time zone 'UTC') as artifacts
  `;
  if (rows.length !== 1) throw new Error("Refresh before/after inventory unavailable");
  return rows[0]!;
}
