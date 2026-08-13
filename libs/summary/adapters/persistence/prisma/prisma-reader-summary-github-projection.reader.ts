import type {
  ReaderSummaryGitHubProjectionItem,
} from "../../../domain";
import type {
  ReadReaderSummaryGitHubProjectionQuery,
  ReadReaderSummaryGitHubProjectionResult,
  ReaderSummaryGitHubProjectionReaderPort,
} from "../../../ports";
import type { PrismaSummaryClient } from "./prisma-summary-client";

type GitHubProjectionRow = {
  readonly feedItemId: string;
  readonly sourceItemId: string;
  readonly sourceBindingId: string;
  readonly providerKey: string;
  readonly metadataKind: string | null;
  readonly scanJobId: string | null;
  readonly canonicalUrl: string;
  readonly repositoryFullName: string | null;
  readonly rank: string | number | null;
  readonly starsGained: string | number | null;
  readonly window: string | null;
  readonly fetchStartedAt: string | null;
  readonly checkedAt: string | null;
  readonly publishedAt: Date;
  readonly observedAt: Date;
  readonly sourceContentHash: string;
  readonly sourceProviderContentHash: string | null;
};

type EligibleGitHubBindingRow = {
  readonly sourceBindingId: string;
};

const projectionPageSize = 1_000;

export class PrismaReaderSummaryGitHubProjectionReader
  implements ReaderSummaryGitHubProjectionReaderPort
{
  constructor(private readonly prisma: PrismaSummaryClient) {}

  async read(
    query: ReadReaderSummaryGitHubProjectionQuery,
  ): Promise<ReadReaderSummaryGitHubProjectionResult> {
    assertBoundedUtcDay(query);
    const eligibleBindingIds: string[] = [];
    const items: ReaderSummaryGitHubProjectionItem[] = [];
    let pageCount = 0;
    let offset = 0;

    for (;;) {
      const rows = await this.readEligibleBindingPage(query, offset);
      pageCount += 1;
      eligibleBindingIds.push(...rows.map((row) => row.sourceBindingId));
      if (rows.length < projectionPageSize) {
        break;
      }
      offset += rows.length;
    }

    if (eligibleBindingIds.length === 0) {
      return { eligibleBindingIds, items, pageCount };
    }

    offset = 0;
    for (;;) {
      const rows = await this.readItemPage(query, offset);
      pageCount += 1;
      items.push(...rows.map(projectionItemFromRow));
      if (rows.length < projectionPageSize) {
        break;
      }
      offset += rows.length;
    }

    return { eligibleBindingIds, items, pageCount };
  }

  private readEligibleBindingPage(
    query: ReadReaderSummaryGitHubProjectionQuery,
    offset: number,
  ): Promise<readonly EligibleGitHubBindingRow[]> {
    return this.prisma.$queryRaw<readonly EligibleGitHubBindingRow[]>`
      select sb.id::text as "sourceBindingId"
      from source_bindings sb
      join source_catalog_entries sce
        on sce.id = sb.source_catalog_entry_id
      join interests i
        on i.id = sb.interest_id
        and i.tenant_id = sb.tenant_id
        and i.workspace_id = sb.workspace_id
      where sb.tenant_id = ${query.tenantId}
        and sb.workspace_id = ${query.workspaceId}
        and sce.provider_key = 'github-trending-page'
        and sb.status = 'ENABLED'
        and sb.deleted_at is null
        and sb.created_at < ${query.dayEndedAt}
        and i.status = 'ENABLED'
        and i.deleted_at is null
        and lower(
          coalesce(
            nullif(sb.config->>'window', ''),
            nullif(sb.config->>'since', ''),
            nullif(sb.config->>'query', ''),
            nullif(sb.config->'sourceQuery'->>'query', '')
          )
        ) in ('daily', 'today')
      order by sb.id asc
      limit ${projectionPageSize}
      offset ${offset}
    `;
  }

  private readItemPage(
    query: ReadReaderSummaryGitHubProjectionQuery,
    offset: number,
  ): Promise<readonly GitHubProjectionRow[]> {
    return this.prisma.$queryRaw<readonly GitHubProjectionRow[]>`
      select
        fi.id::text as "feedItemId",
        fi.source_item_id::text as "sourceItemId",
        fi.source_binding_id::text as "sourceBindingId",
        si.provider_key as "providerKey",
        si.metadata->>'kind' as "metadataKind",
        si.metadata->'trending'->>'scanJobId' as "scanJobId",
        fi.canonical_url as "canonicalUrl",
        si.metadata->'repository'->>'fullName' as "repositoryFullName",
        si.metadata->'trending'->>'rank' as "rank",
        si.metadata->'trending'->>'starsGained' as "starsGained",
        si.metadata->'trending'->>'window' as "window",
        si.metadata->'trending'->>'fetchStartedAt' as "fetchStartedAt",
        si.metadata->'trending'->>'checkedAt' as "checkedAt",
        fi.published_at as "publishedAt",
        fi.observed_at as "observedAt",
        si.content_hash as "sourceContentHash",
        si.provider_content_hash as "sourceProviderContentHash"
      from feed_items fi
      join source_items si
        on si.id = fi.source_item_id
        and si.source_binding_id = fi.source_binding_id
        and si.tenant_id = fi.tenant_id
        and si.workspace_id = fi.workspace_id
        and si.canonical_url = fi.canonical_url
      join source_bindings sb
        on sb.id = fi.source_binding_id
        and sb.tenant_id = fi.tenant_id
        and sb.workspace_id = fi.workspace_id
      join source_catalog_entries sce
        on sce.id = sb.source_catalog_entry_id
      join interests i
        on i.id = sb.interest_id
        and i.tenant_id = sb.tenant_id
        and i.workspace_id = sb.workspace_id
      where fi.tenant_id = ${query.tenantId}
        and fi.workspace_id = ${query.workspaceId}
        and sce.provider_key = 'github-trending-page'
        and fi.provider_key = 'github-trending-page'
        and si.provider_key = 'github-trending-page'
        and fi.status = 'VISIBLE'
        and fi.observed_at >= ${query.dayStartedAt}
        and fi.observed_at <= ${query.observedThrough}
        and si.observed_at >= ${query.dayStartedAt}
        and si.observed_at <= ${query.observedThrough}
        and sb.status = 'ENABLED'
        and sb.deleted_at is null
        and sb.created_at < ${query.dayEndedAt}
        and i.status = 'ENABLED'
        and i.deleted_at is null
        and lower(
          coalesce(
            nullif(sb.config->>'window', ''),
            nullif(sb.config->>'since', ''),
            nullif(sb.config->>'query', ''),
            nullif(sb.config->'sourceQuery'->>'query', '')
          )
        ) in ('daily', 'today')
      order by sb.id asc, fi.observed_at asc, fi.id asc
      limit ${projectionPageSize}
      offset ${offset}
    `;
  }
}

const projectionItemFromRow = (
  row: GitHubProjectionRow,
): ReaderSummaryGitHubProjectionItem => ({
  feedItemId: row.feedItemId,
  sourceItemId: row.sourceItemId,
  sourceBindingId: row.sourceBindingId,
  providerKey: row.providerKey,
  ...(nonEmpty(row.metadataKind) === undefined
    ? {}
    : { metadataKind: nonEmpty(row.metadataKind) }),
  ...(nonEmpty(row.scanJobId) === undefined
    ? {}
    : { scanJobId: nonEmpty(row.scanJobId) }),
  canonicalUrl: row.canonicalUrl,
  ...(nonEmpty(row.repositoryFullName) === undefined
    ? {}
    : { repositoryFullName: nonEmpty(row.repositoryFullName) }),
  ...(positiveInteger(row.rank) === undefined
    ? {}
    : { rank: positiveInteger(row.rank) }),
  ...(nonNegativeInteger(row.starsGained) === undefined
    ? {}
    : { starsGained: nonNegativeInteger(row.starsGained) }),
  ...(nonEmpty(row.window) === undefined
    ? {}
    : { window: nonEmpty(row.window) }),
  ...(validDate(row.fetchStartedAt) === undefined
    ? {}
    : { fetchStartedAt: validDate(row.fetchStartedAt) }),
  ...(validDate(row.checkedAt) === undefined
    ? {}
    : { checkedAt: validDate(row.checkedAt) }),
  publishedAt: new Date(row.publishedAt),
  observedAt: new Date(row.observedAt),
  sourceContentHash: row.sourceContentHash,
  sourceProviderContentHash: nonEmpty(row.sourceProviderContentHash) ?? "",
});

const assertBoundedUtcDay = (
  query: ReadReaderSummaryGitHubProjectionQuery,
): void => {
  if (
    !Number.isFinite(query.dayStartedAt.getTime()) ||
    !Number.isFinite(query.dayEndedAt.getTime()) ||
    !Number.isFinite(query.observedThrough.getTime())
  ) {
    throw new Error(
      "GitHub projection query must be scoped to one exact UTC day",
    );
  }
  const day = query.dayStartedAt.toISOString().slice(0, 10);
  const expectedStart = new Date(`${day}T00:00:00.000Z`);
  const expectedEnd = new Date(expectedStart);
  expectedEnd.setUTCDate(expectedEnd.getUTCDate() + 1);
  if (
    query.dayStartedAt.getTime() !== expectedStart.getTime() ||
    query.dayEndedAt.getTime() !== expectedEnd.getTime() ||
    query.observedThrough.getTime() < query.dayStartedAt.getTime()
  ) {
    throw new Error(
      "GitHub projection query must be scoped to one exact UTC day",
    );
  }
};

const nonEmpty = (value: string | null): string | undefined =>
  value === null || value.trim().length === 0 ? undefined : value.trim();

const positiveInteger = (
  value: string | number | null,
): number | undefined => {
  if (value === null) {
    return undefined;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
};

const nonNegativeInteger = (
  value: string | number | null,
): number | undefined => {
  if (value === null) {
    return undefined;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
};

const validDate = (value: string | null): Date | undefined => {
  if (value === null) {
    return undefined;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value
    ? parsed
    : undefined;
};
