import { createHash } from "node:crypto";

import { runWithTenantDatabaseAccess } from "@social-monitor/platform-persistence";
import type { PrismaSummaryClient } from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-client";
import type { ReaderSummaryTimestampPolicy } from "@social-monitor/summary/ports";

export const readerSummaryDayDatasetManifestFormat =
  "reader-summary-day-dataset-manifest-v1";

type DatasetRow = {
  readonly providerKey: string;
  readonly rowJson: string;
};

type EligibilityRow = {
  readonly rowJson: string;
};

export type ReaderSummaryDayDatasetManifest = {
  readonly schemaVersion: 1;
  readonly format: typeof readerSummaryDayDatasetManifestFormat;
  readonly generatedAt: string;
  readonly scope: {
    readonly tenantId: string;
    readonly workspaceId: string;
  };
  readonly period: {
    readonly startedAt: string;
    readonly endedAt: string;
    readonly timezone: "UTC";
  };
  readonly dataset: {
    readonly feedRowCount: number;
    readonly providerCounts: Readonly<Record<string, number>>;
    readonly feedRowsSha256: string;
    readonly githubEligibilityRowCount: number;
    readonly githubEligibilitySha256: string;
    readonly aggregateSha256: string;
  };
  readonly policy: {
    readonly status: "VISIBLE";
    readonly timestampPolicy: ReaderSummaryTimestampPolicy;
    readonly githubRowsIncluded: true;
    readonly githubEligibilityIncluded: true;
  };
  readonly redaction: {
    readonly rawContentPersisted: false;
    readonly rawProviderPayloadPersisted: false;
    readonly secretsIncluded: false;
  };
};

export async function captureReaderSummaryDayDatasetManifest(params: {
  readonly client: Pick<PrismaSummaryClient, "$queryRaw">;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly startedAt: Date;
  readonly endedAt: Date;
  readonly generatedAt: Date;
  readonly timestampPolicy?: ReaderSummaryTimestampPolicy;
}): Promise<ReaderSummaryDayDatasetManifest> {
  assertExactUtcDay(params.startedAt, params.endedAt);
  const timestampPolicy = params.timestampPolicy ?? "published_at";
  const { feedRows, eligibilityRows } = await runWithTenantDatabaseAccess(
    {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
    },
    async () => ({
      feedRows: await readFeedRows({ ...params, timestampPolicy }),
      eligibilityRows: await readGitHubEligibilityRows(params),
    }),
  );
  return buildReaderSummaryDayDatasetManifest({
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    startedAt: params.startedAt,
    endedAt: params.endedAt,
    generatedAt: params.generatedAt,
    timestampPolicy,
    feedRows,
    eligibilityRows,
  });
}

export function buildReaderSummaryDayDatasetManifest(params: {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly startedAt: Date;
  readonly endedAt: Date;
  readonly generatedAt: Date;
  readonly timestampPolicy?: ReaderSummaryTimestampPolicy;
  readonly feedRows: readonly DatasetRow[];
  readonly eligibilityRows: readonly EligibilityRow[];
}): ReaderSummaryDayDatasetManifest {
  assertExactUtcDay(params.startedAt, params.endedAt);
  const timestampPolicy = params.timestampPolicy ?? "published_at";
  const providerCounts: Record<string, number> = {};
  for (const row of params.feedRows) {
    providerCounts[row.providerKey] =
      (providerCounts[row.providerKey] ?? 0) + 1;
  }
  const feedRowsSha256 = digestRows(params.feedRows.map((row) => row.rowJson));
  const githubEligibilitySha256 = digestRows(
    params.eligibilityRows.map((row) => row.rowJson),
  );
  const aggregateSha256 = digestRows([
    feedRowsSha256,
    githubEligibilitySha256,
    String(params.feedRows.length),
    String(params.eligibilityRows.length),
    JSON.stringify(sortedRecord(providerCounts)),
    timestampPolicy,
  ]);
  return {
    schemaVersion: 1,
    format: readerSummaryDayDatasetManifestFormat,
    generatedAt: params.generatedAt.toISOString(),
    scope: {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
    },
    period: {
      startedAt: params.startedAt.toISOString(),
      endedAt: params.endedAt.toISOString(),
      timezone: "UTC",
    },
    dataset: {
      feedRowCount: params.feedRows.length,
      providerCounts: sortedRecord(providerCounts),
      feedRowsSha256,
      githubEligibilityRowCount: params.eligibilityRows.length,
      githubEligibilitySha256,
      aggregateSha256,
    },
    policy: {
      status: "VISIBLE",
      timestampPolicy,
      githubRowsIncluded: true,
      githubEligibilityIncluded: true,
    },
    redaction: {
      rawContentPersisted: false,
      rawProviderPayloadPersisted: false,
      secretsIncluded: false,
    },
  };
}

export function manifestsMatch(
  expected: ReaderSummaryDayDatasetManifest,
  actual: ReaderSummaryDayDatasetManifest,
): boolean {
  return (
    expected.scope.tenantId === actual.scope.tenantId &&
    expected.scope.workspaceId === actual.scope.workspaceId &&
    expected.period.startedAt === actual.period.startedAt &&
    expected.period.endedAt === actual.period.endedAt &&
    expected.policy.timestampPolicy === actual.policy.timestampPolicy &&
    expected.dataset.aggregateSha256 === actual.dataset.aggregateSha256 &&
    expected.dataset.feedRowCount === actual.dataset.feedRowCount &&
    expected.dataset.githubEligibilityRowCount ===
      actual.dataset.githubEligibilityRowCount &&
    JSON.stringify(expected.dataset.providerCounts) ===
      JSON.stringify(actual.dataset.providerCounts)
  );
}

export function parseReaderSummaryDayDatasetManifest(
  bytes: Uint8Array,
): ReaderSummaryDayDatasetManifest {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown;
  } catch {
    throw new Error("Dataset manifest is not valid JSON");
  }
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    value.format !== readerSummaryDayDatasetManifestFormat ||
    typeof value.generatedAt !== "string" ||
    !isRecord(value.scope) ||
    typeof value.scope.tenantId !== "string" ||
    typeof value.scope.workspaceId !== "string" ||
    !isRecord(value.period) ||
    typeof value.period.startedAt !== "string" ||
    typeof value.period.endedAt !== "string" ||
    value.period.timezone !== "UTC" ||
    !isRecord(value.dataset) ||
    !isExactCount(value.dataset.feedRowCount) ||
    !isCountRecord(value.dataset.providerCounts) ||
    !isSha256(value.dataset.feedRowsSha256) ||
    !isExactCount(value.dataset.githubEligibilityRowCount) ||
    !isSha256(value.dataset.githubEligibilitySha256) ||
    !isSha256(value.dataset.aggregateSha256) ||
    !isRecord(value.policy) ||
    value.policy.status !== "VISIBLE" ||
    (value.policy.timestampPolicy !== "published_at" &&
      value.policy.timestampPolicy !== "observed_at") ||
    value.policy.githubRowsIncluded !== true ||
    value.policy.githubEligibilityIncluded !== true ||
    !isRecord(value.redaction) ||
    Object.values(value.redaction).some((item) => item !== false)
  ) {
    throw new Error("Dataset manifest contract is invalid");
  }
  return value as unknown as ReaderSummaryDayDatasetManifest;
}

async function readFeedRows(params: {
  readonly client: Pick<PrismaSummaryClient, "$queryRaw">;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly startedAt: Date;
  readonly endedAt: Date;
  readonly timestampPolicy: ReaderSummaryTimestampPolicy;
}): Promise<readonly DatasetRow[]> {
  return params.client.$queryRaw<readonly DatasetRow[]>`
    select
      fi.provider_key as "providerKey",
      jsonb_build_object(
        'feedItemId', fi.id,
        'interestId', fi.interest_id,
        'sourceItemId', fi.source_item_id,
        'sourceBindingId', fi.source_binding_id,
        'providerKey', fi.provider_key,
        'dedupeKey', fi.dedupe_key,
        'canonicalUrl', fi.canonical_url,
        'title', fi.title,
        'bodyPreview', fi.body_preview,
        'authorHandle', fi.author_handle,
        'publishedAt', fi.published_at,
        'observedAt', fi.observed_at,
        'providerMetadata', fi.provider_metadata,
        'sourceProviderKey', si.provider_key,
        'sourceProviderItemId', si.provider_item_id,
        'sourceCanonicalUrl', si.canonical_url,
        'sourceTitle', si.title,
        'sourceBody', si.body,
        'sourceAuthorHandle', si.author_handle,
        'sourcePublishedAt', si.published_at,
        'sourceContentHash', si.content_hash,
        'sourceProviderContentHash', si.provider_content_hash,
        'sourceObservedAt', si.observed_at,
        'sourceLastObservedAt', si.last_observed_at,
        'sourceContentUpdatedAt', si.content_updated_at,
        'sourceMetadata', si.metadata,
        'sourceSchemaVersion', si.schema_version
      )::text as "rowJson"
    from feed_items fi
    join source_items si
      on si.id = fi.source_item_id
      and si.tenant_id = fi.tenant_id
      and si.workspace_id = fi.workspace_id
    where fi.tenant_id = ${params.tenantId}::uuid
      and fi.workspace_id = ${params.workspaceId}::uuid
      and fi.status = 'VISIBLE'
      and case ${params.timestampPolicy}
        when 'published_at' then fi.published_at
        when 'observed_at' then fi.observed_at
        else null
      end >= ${params.startedAt}
      and case ${params.timestampPolicy}
        when 'published_at' then fi.published_at
        when 'observed_at' then fi.observed_at
        else null
      end < ${params.endedAt}
    order by fi.id asc
  `;
}

async function readGitHubEligibilityRows(params: {
  readonly client: Pick<PrismaSummaryClient, "$queryRaw">;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly endedAt: Date;
}): Promise<readonly EligibilityRow[]> {
  return params.client.$queryRaw<readonly EligibilityRow[]>`
    select jsonb_build_object(
      'sourceBindingId', sb.id,
      'bindingStatus', sb.status,
      'bindingDeletedAt', sb.deleted_at,
      'bindingCreatedAt', sb.created_at,
      'bindingConfig', sb.config,
      'interestId', i.id,
      'interestStatus', i.status,
      'interestDeletedAt', i.deleted_at,
      'catalogProviderKey', sce.provider_key
    )::text as "rowJson"
    from source_bindings sb
    join source_catalog_entries sce on sce.id = sb.source_catalog_entry_id
    join interests i
      on i.id = sb.interest_id
      and i.tenant_id = sb.tenant_id
      and i.workspace_id = sb.workspace_id
    where sb.tenant_id = ${params.tenantId}::uuid
      and sb.workspace_id = ${params.workspaceId}::uuid
      and sce.provider_key = 'github-trending-page'
      and sb.created_at < ${params.endedAt}
    order by sb.id asc
  `;
}

function digestRows(rows: readonly string[]): string {
  const hash = createHash("sha256");
  for (const row of rows) {
    hash.update(String(Buffer.byteLength(row)), "utf8");
    hash.update(":", "utf8");
    hash.update(row, "utf8");
    hash.update("\n", "utf8");
  }
  return hash.digest("hex");
}

function sortedRecord(
  value: Readonly<Record<string, number>>,
): Readonly<Record<string, number>> {
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function assertExactUtcDay(startedAt: Date, endedAt: Date): void {
  const expectedStart = `${startedAt.toISOString().slice(0, 10)}T00:00:00.000Z`;
  if (
    startedAt.toISOString() !== expectedStart ||
    endedAt.getTime() - startedAt.getTime() !== 86_400_000
  ) {
    throw new Error("Dataset manifest requires one exact UTC day");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

function isExactCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isCountRecord(value: unknown): value is Record<string, number> {
  return isRecord(value) && Object.values(value).every(isExactCount);
}
