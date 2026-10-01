import { createHash } from "node:crypto";
import { runWithTenantDatabaseAccess } from "@social-monitor/platform-persistence";
import type { PrismaSummaryClient } from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-client";
import { captureReaderSummaryDayDatasetManifest, parseReaderSummaryDayDatasetManifest, assertReaderSummaryDatasetManifestDigest,
  type ReaderSummaryDayDatasetManifest } from "./reader-summary-day-dataset-manifest";

export type FirstPublicationInventory = Readonly<{
  format: "reader-summary-first-publication-inventory-v1";
  datasetManifest: ReaderSummaryDayDatasetManifest;
  observationScopeSha256: string;
  coverage: "UNPROVEN";
}>;

type Client = Pick<PrismaSummaryClient, "$queryRaw">;

/** Reads every visible published-day row, including invalid joins. No cutoff
 * filter may shrink the expected inventory to the in-day observation count. */
export async function readFirstPublicationObservationScope(client: Client,
  manifest: ReaderSummaryDayDatasetManifest): Promise<string> {
  const rows = await runWithTenantDatabaseAccess(manifest.scope, () => client.$queryRaw<readonly {
    visibleCount: number; validCount: number; scopeValid: boolean; sha256: string;
  }[]>`
    with inventory as (
      select f.id, (s.id is not null and b.id is not null and i.id is not null and c.id is not null
        and f.provider_key = s.provider_key and f.provider_key = c.provider_key
        and f.interest_id = b.interest_id and s.source_binding_id = f.source_binding_id
        and s.canonical_url = f.canonical_url
        and b.created_at <= ${new Date(manifest.generatedAt)} and i.created_at <= ${new Date(manifest.generatedAt)}
        and f.updated_at <= ${new Date(manifest.generatedAt)}
        and b.deleted_at is null and i.deleted_at is null
        and b.status = 'ENABLED' and i.status = 'ENABLED'
        and f.observed_at >= ${new Date(manifest.period.startedAt)}
        and f.observed_at <= ${new Date(manifest.generatedAt)}
        and s.observed_at >= ${new Date(manifest.period.startedAt)}
        and s.observed_at <= ${new Date(manifest.generatedAt)}
        and coalesce(s.last_observed_at, s.observed_at) <= ${new Date(manifest.generatedAt)}
        and coalesce(s.content_updated_at, s.observed_at) <= ${new Date(manifest.generatedAt)}) is true as valid,
        jsonb_build_array(to_jsonb(f), to_jsonb(s), to_jsonb(b), to_jsonb(i), to_jsonb(c)) as row
      from feed_items f
      left join source_items s on s.id = f.source_item_id
        and s.tenant_id = f.tenant_id and s.workspace_id = f.workspace_id
      left join source_bindings b on b.id = f.source_binding_id
        and b.tenant_id = f.tenant_id and b.workspace_id = f.workspace_id
      left join interests i on i.id = f.interest_id
        and i.tenant_id = f.tenant_id and i.workspace_id = f.workspace_id
      left join source_catalog_entries c on c.id = b.source_catalog_entry_id
      where f.tenant_id = ${manifest.scope.tenantId}::uuid
        and f.workspace_id = ${manifest.scope.workspaceId}::uuid and f.status = 'VISIBLE'
        and f.published_at >= ${new Date(manifest.period.startedAt)}
        and f.published_at < ${new Date(manifest.period.endedAt)}
    ), metrics as (
      select 'snapshot' as kind, to_jsonb(e) as row, e.last_observed_at as observed_at
      from source_item_engagement_snapshots e where e.tenant_id = ${manifest.scope.tenantId}::uuid
        and e.workspace_id = ${manifest.scope.workspaceId}::uuid
        and e.source_item_id in (select source_item_id from feed_items where id in (select id from inventory))
      union all
      select 'observation', to_jsonb(e), e.observed_at from source_item_engagement_observations e
      where e.tenant_id = ${manifest.scope.tenantId}::uuid and e.workspace_id = ${manifest.scope.workspaceId}::uuid
        and e.source_item_id in (select source_item_id from feed_items where id in (select id from inventory))
    ), scope_rows as (
      select jsonb_build_array(to_jsonb(t), to_jsonb(w)) as row,
        (t.deleted_at is null and w.deleted_at is null) as valid
      from tenants t join workspaces w on w.tenant_id = t.id
      where t.id = ${manifest.scope.tenantId}::uuid and w.id = ${manifest.scope.workspaceId}::uuid
    )
    select (select count(*)::int from inventory) as "visibleCount",
      (select count(*)::int from inventory where valid) as "validCount",
      ((select count(*) = 1 and bool_and(valid) from scope_rows) and
        not exists(select 1 from metrics where observed_at is null or observed_at > ${new Date(manifest.generatedAt)})) as "scopeValid",
      encode(sha256(convert_to(jsonb_build_array(
        (select coalesce(jsonb_agg(row order by id), '[]') from inventory),
        (select coalesce(jsonb_agg(row), '[]') from scope_rows),
        (select coalesce(jsonb_agg(jsonb_build_array(kind, row) order by kind, row::text), '[]') from metrics)
      )::text, 'UTF8')), 'hex') as sha256
  `);
  const row = rows[0];
  if (rows.length !== 1 || row === undefined || row.scopeValid !== true ||
      row.visibleCount !== manifest.dataset.feedRowCount || row.validCount !== row.visibleCount ||
      !/^[0-9a-f]{64}$/u.test(row.sha256)) {
    throw new Error("First publication inventory observation, canonical join or active scope is invalid");
  }
  return row.sha256;
}

export async function captureFirstPublicationInventory(
  params: Parameters<typeof captureReaderSummaryDayDatasetManifest>[0],
): Promise<FirstPublicationInventory> {
  const datasetManifest = await captureReaderSummaryDayDatasetManifest(params);
  assertFirstPublicationInventoryPeriod(datasetManifest);
  return { format: "reader-summary-first-publication-inventory-v1", datasetManifest,
    observationScopeSha256: await readFirstPublicationObservationScope(params.client, datasetManifest), coverage: "UNPROVEN" };
}

export function parseFirstPublicationInventory(bytes: Uint8Array): FirstPublicationInventory {
  const value = JSON.parse(Buffer.from(bytes).toString("utf8")) as FirstPublicationInventory;
  if (value?.format !== "reader-summary-first-publication-inventory-v1" ||
      value.coverage !== "UNPROVEN" || !/^[0-9a-f]{64}$/u.test(value.observationScopeSha256)) {
    throw new Error("First publication inventory manifest is invalid");
  }
  const datasetManifest = parseReaderSummaryDayDatasetManifest(Buffer.from(JSON.stringify(value.datasetManifest)));
  assertFirstPublicationInventoryPeriod(datasetManifest);
  return { ...value, datasetManifest };
}

export function assertFirstPublicationInventoryPeriod(manifest: ReaderSummaryDayDatasetManifest): void {
  assertReaderSummaryDatasetManifestDigest(manifest);
  const start = Date.parse(manifest.period.startedAt), end = Date.parse(manifest.period.endedAt);
  const asof = Date.parse(manifest.generatedAt);
  // JS reads use milliseconds; reject extra precision instead of silently
  // truncating an authoritative microsecond boundary in SQL or GitHub reads.
  if (![start, end, asof].every(Number.isFinite) ||
      new Date(asof).toISOString() !== manifest.generatedAt || start % 86_400_000 !== 0 ||
      end - start !== 86_400_000 || end > asof || manifest.policy.timestampPolicy !== "published_at" ||
      manifest.retainedEngagementAuthority !== undefined) {
    throw new Error("First publication requires a completed exact UTC published_at day and millisecond as-of precision");
  }
}

export const firstPublicationBytesSha256 = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");
