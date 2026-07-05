import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { Pool } from "pg";

import { PrismaFeedConnection } from "../libs/feed/adapters/persistence/prisma/prisma-feed-connection";
import { PrismaFeedItemReadRepository } from "../libs/feed/adapters/persistence/prisma/prisma-feed-item-read.repository";
import { InMemoryUserRelevanceProfileRepository } from "../libs/relevance/adapters/persistence/in-memory-user-relevance-profile.repository";
import { SourceContentQualityPolicy } from "../libs/relevance/domain";
import { RankFeedItemsUseCase } from "../libs/relevance/features/rank-feed-items/rank-feed-items.use-case";
import { readerSummaryArtifactFromPrisma } from "../libs/summary/adapters/persistence/prisma/prisma-reader-summary-records";
import {
  presentReaderSummaryArtifact,
  type ReaderSummaryArtifactView,
} from "../libs/summary/features/shared/reader-summary-artifact-presenter";
import { FixedClock, type JsonObject } from "@social-monitor/shared-kernel";

import {
  collectionDateOptionOrDefault,
  fingerprint,
  message,
  noRawSecretFragments,
  normalizeLineEndings,
  readCollectionIntegrityStatus,
  readOption,
  roundMetric,
  yesterdaySocialQualityDatabaseUrl,
} from "./lib/yesterday-social-replay-support";
import {
  asRecord,
  dayEnd,
  dayStart,
  isDefined,
  isLocalDataSourceUnavailable,
  readDominantReaderSummaryQualityScope,
  readLatestReaderSummaryArtifact,
  readMetadataString,
  type ReaderSummaryQualityScope as Scope,
} from "./lib/reader-summary-quality-eval-support";

type ProviderKey = "reddit" | "x-twitter";

type FeedItemRow = {
  readonly id: string;
  readonly sourceItemId: string;
  readonly sourceBindingId: string;
  readonly interestId: string;
  readonly providerKey: string;
  readonly canonicalUrl: string;
  readonly authorHandle: string | null;
  readonly title: string;
  readonly bodyPreview: string | null;
  readonly publishedAt: Date;
  readonly observedAt: Date;
  readonly providerMetadata: unknown;
};

type RankedTrace = {
  readonly score: number;
  readonly rank: number;
  readonly reasonCount: number;
};

type SourceQualityTraceReport = {
  readonly schemaVersion: 1;
  readonly artifactFormat: "reader-summary-source-quality-trace-v1";
  readonly collectionDate: string;
  readonly generatedBy: string;
  readonly model: {
    readonly liveNetwork: false;
    readonly reportBuilder: "reader-summary-source-quality-trace";
    readonly rawPostTextPersistedInReport: false;
    readonly rawProviderPayloadPersistedInReport: false;
  };
  readonly inputs: {
    readonly database: "local-postgres";
    readonly period: {
      readonly startedAt: string;
      readonly endedAt: string;
      readonly timezone: "UTC";
    };
    readonly rankLimit: number;
    readonly scope: {
      readonly tenantFingerprint: string;
      readonly workspaceFingerprint: string;
    };
  };
  readonly summary: {
    readonly artifactFingerprint: string;
    readonly selectedFeedItemCount: number;
    readonly topReadCount: number;
  };
  readonly sources: Record<ProviderKey, SourceTrace>;
  readonly qualityGates: Record<string, boolean>;
  readonly warningSignals: Record<string, boolean>;
  readonly blockingPassed: boolean;
};

type SourceTrace = {
  readonly collectedCount: number;
  readonly laneCount: number;
  readonly rankedCount: number;
  readonly selectedCount: number;
  readonly topReadCount: number;
  readonly topReadEligibleCount: number;
  readonly weakTopicMatchCount: number;
  readonly ineligibleTopReadCount: number;
  readonly weakTopicMatchTopReadCount: number;
  readonly ineligibleActualTopReadCount: number;
  readonly averageRankScore: number;
  readonly laneFamilies: Record<string, number>;
  readonly laneFamilyHealth: Record<string, LaneFamilyTrace>;
  readonly laneHealth: readonly LaneTrace[];
};

type LaneFamilyTrace = {
  readonly collectedCount: number;
  readonly rankedCount: number;
  readonly selectedCount: number;
  readonly topReadCount: number;
  readonly weakTopicMatchCount: number;
  readonly weakTopicMatchTopReadCount: number;
  readonly ineligibleActualTopReadCount: number;
  readonly averageRankScore: number;
};

type LaneTrace = {
  readonly laneFingerprint: string;
  readonly laneFamily: string;
  readonly queryFingerprint: string;
  readonly collectedCount: number;
  readonly rankedCount: number;
  readonly selectedCount: number;
  readonly topReadCount: number;
  readonly topReadEligibleCount: number;
  readonly weakTopicMatchCount: number;
  readonly ineligibleTopReadCount: number;
  readonly weakTopicMatchTopReadCount: number;
  readonly ineligibleActualTopReadCount: number;
  readonly averageRankScore: number;
  readonly maxRankScore: number;
  readonly qualityDecisions: Record<string, number>;
  readonly sampleItems: readonly ItemTrace[];
};

type ItemTrace = {
  readonly itemFingerprint: string;
  readonly rank?: number;
  readonly rankScore?: number;
  readonly qualityDecision: string;
  readonly eligibleForSummary: boolean;
  readonly eligibleForTopRead: boolean;
  readonly flags: readonly string[];
  readonly selected: boolean;
  readonly topRead: boolean;
  readonly filterReasons: readonly string[];
};

const rankLimit = 200;
const primarySources = ["reddit", "x-twitter"] as const;
const xTwitterLaneFamilies = [
  "fallback",
  "from",
  "mention",
  "product_or_group",
  "search:general",
] as const;
const outputPath = "ops/evals/reader-summary-source-quality-trace.v1.json";
const databaseUrl = yesterdaySocialQualityDatabaseUrl();
const update = process.argv.includes("--update");
const artifactOnly = process.argv.includes("--artifact-only");
const explicitDate = readOption("--date");

void main();

async function main(): Promise<void> {
  if (artifactOnly) {
    validateExistingReport();
    return;
  }

  const report = await tryBuildReport();

  if (report === undefined) {
    if (update) {
      throw new Error(
        "Local source quality trace data source is unavailable; cannot update report.",
      );
    }
    validateExistingReport();
    return;
  }

  const serialized = `${JSON.stringify(report, null, 2)}\n`;

  if (!report.blockingPassed) {
    console.error(serialized);
    throw new Error("Reader summary source quality trace gates failed");
  }

  if (update) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, serialized);
    console.log(`Updated ${outputPath}`);
    return;
  }

  if (!existsSync(outputPath)) {
    throw new Error(
      `${outputPath} is missing. Run npm run check:reader-summary-source-quality-trace -- --update`,
    );
  }

  const expected = normalizeLineEndings(readFileSync(outputPath, "utf8"));
  if (expected !== serialized) {
    throw new Error(
      `${outputPath} is stale. Run npm run check:reader-summary-source-quality-trace -- --update`,
    );
  }

  console.log(
    `Reader summary source quality trace OK (${report.collectionDate}, reddit=${report.sources.reddit.collectedCount}, x=${report.sources["x-twitter"].collectedCount})`,
  );
}

async function tryBuildReport(): Promise<SourceQualityTraceReport | undefined> {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 2_000,
  });

  try {
    return await buildReport(pool);
  } catch (error) {
    if (!isLocalDataSourceUnavailable(error)) {
      throw error;
    }
    console.warn(
      `Source quality trace local source unavailable: ${message(error)}`,
    );
    return undefined;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

async function buildReport(pool: Pool): Promise<SourceQualityTraceReport> {
  const collectionDate = explicitDate ?? (await latestCleanDate(pool));
  const scope = await readDominantReaderSummaryQualityScope(
    pool,
    collectionDate,
  );
  const artifactRecord = await readLatestReaderSummaryArtifact(
    pool,
    scope,
    collectionDate,
  );
  if (artifactRecord === null) {
    throw new Error(`No reader summary artifact found for ${collectionDate}`);
  }

  const view = presentReaderSummaryArtifact(
    readerSummaryArtifactFromPrisma(artifactRecord),
    { status: "fresh", checkedAt: new Date(`${collectionDate}T23:59:59.000Z`) },
  );
  const feedItems = await readFeedItems(pool, scope, collectionDate);
  const ranked = await rankFeedItems(scope, collectionDate);
  const rankedById = new Map(
    ranked.map((item) => [
      item.feedItemId,
      {
        score: item.score,
        rank: item.rank,
        reasonCount: item.whyImportant.length,
      } satisfies RankedTrace,
    ]),
  );
  const selectedFeedItemIds = new Set(view.sourceWindow.selectedFeedItemIds);
  const topReadFeedItemIds = topReadCitationFeedItemIds(view);
  const sources = {
    reddit: buildSourceTrace({
      providerKey: "reddit",
      feedItems,
      rankedById,
      selectedFeedItemIds,
      topReadFeedItemIds,
    }),
    "x-twitter": buildSourceTrace({
      providerKey: "x-twitter",
      feedItems,
      rankedById,
      selectedFeedItemIds,
      topReadFeedItemIds,
    }),
  };
  const qualityGates = {
    collectionIntegrityClean:
      readCollectionIntegrityStatus(collectionDate).status === "clean",
    summaryArtifactPresent: true,
    primarySourcesCollected: primarySources.every(
      (source) => sources[source].collectedCount > 0,
    ),
    primarySourcesHaveLaneHealth: primarySources.every(
      (source) => sources[source].laneCount >= 2,
    ),
    primarySourcesHaveRankAndSelectionTrace: primarySources.every(
      (source) =>
        sources[source].rankedCount > 0 && sources[source].selectedCount > 0,
    ),
    primarySourcesReachTopReads: primarySources.every(
      (source) => sources[source].topReadCount > 0,
    ),
    redditTopReadsAreQualityEligible:
      sources.reddit.ineligibleActualTopReadCount === 0 &&
      sources.reddit.weakTopicMatchTopReadCount === 0,
    xTwitterTopReadsAreQualityEligible:
      sources["x-twitter"].ineligibleActualTopReadCount === 0 &&
      sources["x-twitter"].weakTopicMatchTopReadCount === 0,
    xTwitterLaneHealthMetricsPresent:
      Object.keys(sources["x-twitter"].laneFamilies).length >= 1 &&
      xTwitterLaneFamilies.every(
        (family) => sources["x-twitter"].laneFamilyHealth[family] !== undefined,
      ) &&
      sources["x-twitter"].laneHealth.every(
        (lane) =>
          lane.collectedCount >= 0 &&
          lane.rankedCount >= 0 &&
          lane.selectedCount >= 0 &&
          lane.topReadCount >= 0,
      ),
    noRawSecretFragments: true,
  };
  const reportWithoutSecretGate = {
    schemaVersion: 1,
    artifactFormat: "reader-summary-source-quality-trace-v1",
    collectionDate,
    generatedBy: "npm run check:reader-summary-source-quality-trace",
    model: {
      liveNetwork: false,
      reportBuilder: "reader-summary-source-quality-trace",
      rawPostTextPersistedInReport: false,
      rawProviderPayloadPersistedInReport: false,
    },
    inputs: {
      database: "local-postgres",
      period: {
        startedAt: dayStart(collectionDate),
        endedAt: dayEnd(collectionDate),
        timezone: "UTC",
      },
      rankLimit,
      scope: {
        tenantFingerprint: fingerprint(String(scope.tenantId)),
        workspaceFingerprint: fingerprint(String(scope.workspaceId)),
      },
    },
    summary: {
      artifactFingerprint: fingerprint(artifactRecord.id),
      selectedFeedItemCount: view.coverage.selectedFeedItemCount,
      topReadCount: view.content.topReads.length,
    },
    sources,
    qualityGates,
    warningSignals: {
      redditWeakTopicMatchesCollected: sources.reddit.weakTopicMatchCount > 0,
      xTwitterWeakTopicMatchesCollected:
        sources["x-twitter"].weakTopicMatchCount > 0,
      redditIneligibleCollected:
        sources.reddit.ineligibleTopReadCount >
        sources.reddit.weakTopicMatchCount,
      xTwitterIneligibleCollected:
        sources["x-twitter"].ineligibleTopReadCount >
        sources["x-twitter"].weakTopicMatchCount,
      xTwitterNoFromLaneObserved: !Object.keys(
        sources["x-twitter"].laneFamilies,
      ).some((family) => family.includes("from")),
    },
    blockingPassed: false,
  } satisfies SourceQualityTraceReport;
  const finalQualityGates = {
    ...qualityGates,
    noRawSecretFragments: noRawSecretFragments(reportWithoutSecretGate),
  };

  return {
    ...reportWithoutSecretGate,
    qualityGates: finalQualityGates,
    blockingPassed: Object.values(finalQualityGates).every(Boolean),
  };
}

function buildSourceTrace(params: {
  readonly providerKey: ProviderKey;
  readonly feedItems: readonly FeedItemRow[];
  readonly rankedById: ReadonlyMap<string, RankedTrace>;
  readonly selectedFeedItemIds: ReadonlySet<string>;
  readonly topReadFeedItemIds: ReadonlySet<string>;
}): SourceTrace {
  const providerItems = params.feedItems.filter(
    (item) => item.providerKey === params.providerKey,
  );
  const laneGroups = new Map<string, FeedItemRow[]>();
  for (const item of providerItems) {
    const lane = laneDescriptor(params.providerKey, item.providerMetadata);
    laneGroups.set(lane.key, [...(laneGroups.get(lane.key) ?? []), item]);
  }
  const laneHealth = [...laneGroups.entries()]
    .map(([key, items]) =>
      buildLaneTrace({
        providerKey: params.providerKey,
        laneKey: key,
        items,
        rankedById: params.rankedById,
        selectedFeedItemIds: params.selectedFeedItemIds,
        topReadFeedItemIds: params.topReadFeedItemIds,
      }),
    )
    .sort(
      (left, right) =>
        right.topReadCount - left.topReadCount ||
        right.selectedCount - left.selectedCount ||
        right.rankedCount - left.rankedCount ||
        right.collectedCount - left.collectedCount ||
        left.laneFingerprint.localeCompare(right.laneFingerprint),
    );
  const rankedScores = providerItems
    .map((item) => params.rankedById.get(item.id)?.score)
    .filter(isDefined);

  return {
    collectedCount: providerItems.length,
    laneCount: laneHealth.length,
    rankedCount: rankedScores.length,
    selectedCount: providerItems.filter((item) =>
      params.selectedFeedItemIds.has(item.id),
    ).length,
    topReadCount: providerItems.filter((item) =>
      params.topReadFeedItemIds.has(item.id),
    ).length,
    topReadEligibleCount: laneHealth.reduce(
      (sum, lane) => sum + lane.topReadEligibleCount,
      0,
    ),
    weakTopicMatchCount: laneHealth.reduce(
      (sum, lane) => sum + lane.weakTopicMatchCount,
      0,
    ),
    ineligibleTopReadCount: laneHealth.reduce(
      (sum, lane) => sum + lane.ineligibleTopReadCount,
      0,
    ),
    weakTopicMatchTopReadCount: laneHealth.reduce(
      (sum, lane) => sum + lane.weakTopicMatchTopReadCount,
      0,
    ),
    ineligibleActualTopReadCount: laneHealth.reduce(
      (sum, lane) => sum + lane.ineligibleActualTopReadCount,
      0,
    ),
    averageRankScore: averageMetric(rankedScores),
    laneFamilies: countedRecord(laneHealth.map((lane) => lane.laneFamily)),
    laneFamilyHealth: buildLaneFamilyHealth(params.providerKey, laneHealth),
    laneHealth,
  };
}

function buildLaneTrace(params: {
  readonly providerKey: ProviderKey;
  readonly laneKey: string;
  readonly items: readonly FeedItemRow[];
  readonly rankedById: ReadonlyMap<string, RankedTrace>;
  readonly selectedFeedItemIds: ReadonlySet<string>;
  readonly topReadFeedItemIds: ReadonlySet<string>;
}): LaneTrace {
  const qualityPolicy = new SourceContentQualityPolicy();
  const descriptor = laneDescriptor(
    params.providerKey,
    params.items[0]?.providerMetadata,
  );
  const itemTraces = params.items.map((item) => {
    const ranked = params.rankedById.get(item.id);
    const verdict = qualityPolicy.evaluate({
      providerKey: item.providerKey,
      title: item.title,
      bodyPreview: item.bodyPreview ?? undefined,
      canonicalUrl: item.canonicalUrl,
      authorHandle: item.authorHandle ?? undefined,
      providerMetadata: asJsonObject(item.providerMetadata),
    });
    const selected = params.selectedFeedItemIds.has(item.id);
    const topRead = params.topReadFeedItemIds.has(item.id);

    return {
      itemFingerprint: fingerprint(`${item.providerKey}:${item.id}`),
      ...(ranked === undefined
        ? {}
        : { rank: ranked.rank, rankScore: roundMetric(ranked.score) }),
      qualityDecision: verdict.decision,
      eligibleForSummary: verdict.eligibleForSummary,
      eligibleForTopRead: verdict.eligibleForTopRead,
      flags: verdict.flags,
      selected,
      topRead,
      filterReasons: itemFilterReasons({
        ranked,
        selected,
        topRead,
        eligibleForSummary: verdict.eligibleForSummary,
        eligibleForTopRead: verdict.eligibleForTopRead,
        flags: verdict.flags,
      }),
    } satisfies ItemTrace;
  });
  const rankedScores = itemTraces
    .map((item) => item.rankScore)
    .filter(isDefined);

  return {
    laneFingerprint: fingerprint(params.laneKey),
    laneFamily: descriptor.family,
    queryFingerprint: descriptor.queryFingerprint,
    collectedCount: itemTraces.length,
    rankedCount: itemTraces.filter((item) => item.rankScore !== undefined)
      .length,
    selectedCount: itemTraces.filter((item) => item.selected).length,
    topReadCount: itemTraces.filter((item) => item.topRead).length,
    topReadEligibleCount: itemTraces.filter((item) => item.eligibleForTopRead)
      .length,
    weakTopicMatchCount: itemTraces.filter((item) =>
      item.flags.includes("weak_topic_match"),
    ).length,
    ineligibleTopReadCount: itemTraces.filter(
      (item) => !item.eligibleForTopRead,
    ).length,
    weakTopicMatchTopReadCount: itemTraces.filter(
      (item) => item.topRead && item.flags.includes("weak_topic_match"),
    ).length,
    ineligibleActualTopReadCount: itemTraces.filter(
      (item) => item.topRead && !item.eligibleForTopRead,
    ).length,
    averageRankScore: averageMetric(rankedScores),
    maxRankScore: roundMetric(Math.max(0, ...rankedScores)),
    qualityDecisions: countedRecord(
      itemTraces.map((item) => item.qualityDecision),
    ),
    sampleItems: itemTraces.sort(compareItemTraceForSample).slice(0, 8),
  };
}

async function rankFeedItems(
  scope: Scope,
  collectionDate: string,
): Promise<
  readonly {
    readonly feedItemId: string;
    readonly score: number;
    readonly rank: number;
    readonly whyImportant: readonly string[];
  }[]
> {
  const connection = new PrismaFeedConnection(databaseUrl);
  try {
    const useCase = new RankFeedItemsUseCase(
      new PrismaFeedItemReadRepository(connection),
      new InMemoryUserRelevanceProfileRepository(),
      new FixedClock(new Date(`${collectionDate}T23:59:59.000Z`)),
    );
    const result = await useCase.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      observedAfter: new Date(dayStart(collectionDate)),
      observedBefore: new Date(dayEnd(collectionDate)),
      limit: rankLimit,
    });
    if (!result.ok) {
      throw result.error;
    }

    return result.value.items;
  } finally {
    await connection.close().catch(() => undefined);
  }
}

async function readFeedItems(
  pool: Pool,
  scope: Scope,
  collectionDate: string,
): Promise<readonly FeedItemRow[]> {
  const result = await pool.query<FeedItemRow>(
    `
      select
        id::text as "id",
        source_item_id::text as "sourceItemId",
        source_binding_id::text as "sourceBindingId",
        interest_id::text as "interestId",
        provider_key as "providerKey",
        canonical_url as "canonicalUrl",
        author_handle as "authorHandle",
        title,
        body_preview as "bodyPreview",
        published_at as "publishedAt",
        observed_at as "observedAt",
        provider_metadata as "providerMetadata"
      from feed_items
      where tenant_id = $1::uuid
        and workspace_id = $2::uuid
        and observed_at >= $3::timestamptz
        and observed_at < $4::timestamptz
        and provider_key in ('reddit', 'x-twitter')
      order by provider_key, observed_at, id
    `,
    [
      scope.tenantId,
      scope.workspaceId,
      dayStart(collectionDate),
      dayEnd(collectionDate),
    ],
  );

  return result.rows;
}

async function latestCleanDate(pool: Pool): Promise<string> {
  const { collectionDate } = collectionDateOptionOrDefault(
    new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  );
  if (explicitDate !== undefined) {
    return collectionDate;
  }

  const result = await pool.query<{ readonly collectionDate: string }>(
    `
      select to_char(observed_at at time zone 'UTC', 'YYYY-MM-DD') as "collectionDate"
      from feed_items
      group by 1
      order by 1 desc
    `,
  );
  const cleanDate = result.rows
    .map((row) => row.collectionDate)
    .find((date) => readCollectionIntegrityStatus(date).status === "clean");
  if (cleanDate === undefined) {
    throw new Error("No clean collection date found for source quality trace");
  }

  return cleanDate;
}

function topReadCitationFeedItemIds(
  view: ReaderSummaryArtifactView,
): ReadonlySet<string> {
  const citationById = new Map(
    view.citations.map((citation) => [citation.citationId, citation] as const),
  );

  return new Set(
    view.content.topReads.flatMap((read) =>
      read.citationIds
        .map((citationId) => citationById.get(citationId)?.feedItemId)
        .filter(isDefined),
    ),
  );
}

function laneDescriptor(
  providerKey: ProviderKey,
  metadataValue: unknown,
): {
  readonly key: string;
  readonly family: string;
  readonly queryFingerprint: string;
} {
  const metadata = asRecord(metadataValue);
  const lane = asRecord(metadata.sourceQueryLane);
  const query =
    readMetadataString(lane, "query") ??
    readMetadataString(metadata, "searchQuery") ??
    sourceProduct(metadata) ??
    providerSourceKey(providerKey, metadata);
  const family =
    providerKey === "reddit"
      ? redditLaneFamily({ metadata, lane, query })
      : xTwitterLaneFamily({ lane, query });

  return {
    key: `${providerKey}:${family}:${query.toLowerCase()}`,
    family,
    queryFingerprint: fingerprint(`${providerKey}:${query.toLowerCase()}`),
  };
}

function redditLaneFamily(params: {
  readonly metadata: Record<string, unknown>;
  readonly lane: Record<string, unknown>;
  readonly query: string;
}): string {
  const mode = readMetadataString(params.lane, "mode");
  const searchSort =
    readMetadataString(params.lane, "searchSort") ??
    readMetadataString(params.metadata, "searchSort");
  const searchTime =
    readMetadataString(params.lane, "searchTime") ??
    readMetadataString(params.metadata, "searchTime");
  const product = sourceProduct(params.metadata);

  if (mode === "listing" || product === "hot" || product === "top") {
    return `community_listing:${product ?? "listing"}`;
  }

  if (searchSort !== undefined) {
    return `search:${searchSort}:${searchTime ?? "any"}`;
  }

  return params.query.includes(":")
    ? "community_listing:unknown"
    : "search:general";
}

function xTwitterLaneFamily(params: {
  readonly lane: Record<string, unknown>;
  readonly query: string;
}): string {
  const kind = readMetadataString(params.lane, "kind");
  const operation = readMetadataString(params.lane, "operation");
  const query = params.query.toLowerCase();
  const descriptor = `${kind ?? ""}:${operation ?? ""}`.toLowerCase();

  if (descriptor.includes("account_posts") || /\bfrom:/u.test(query)) {
    return "from";
  }
  if (descriptor.includes("account_mentions") || /(^|\s)@[\w_]+/u.test(query)) {
    return "mention";
  }
  if (descriptor.includes("product_or_group") || /\sor\s/u.test(query)) {
    return "product_or_group";
  }
  if (descriptor.includes("fallback")) {
    return "fallback";
  }

  return "search:general";
}

function sourceProduct(metadata: Record<string, unknown>): string | undefined {
  const value =
    readMetadataString(metadata, "sourceProduct") ??
    readMetadataString(metadata, "sort") ??
    readMetadataString(metadata, "searchSort") ??
    readMetadataString(metadata, "timeline");

  return value?.trim().toLowerCase();
}

function providerSourceKey(
  providerKey: ProviderKey,
  metadata: Record<string, unknown>,
): string {
  if (providerKey === "reddit") {
    return readMetadataString(metadata, "subreddit") ?? "unknown";
  }

  return readMetadataString(metadata, "authorHandle") ?? "unknown";
}

function itemFilterReasons(params: {
  readonly ranked: RankedTrace | undefined;
  readonly selected: boolean;
  readonly topRead: boolean;
  readonly eligibleForSummary: boolean;
  readonly eligibleForTopRead: boolean;
  readonly flags: readonly string[];
}): readonly string[] {
  return [
    ...params.flags,
    params.eligibleForSummary ? undefined : "summary_ineligible",
    params.eligibleForTopRead ? undefined : "top_read_ineligible",
    params.ranked === undefined ? "not_ranked_top_200" : undefined,
    params.selected ? "selected_evidence" : "not_selected_evidence",
    params.topRead ? "top_read" : "not_top_read",
  ].filter(isDefined);
}

function compareItemTraceForSample(left: ItemTrace, right: ItemTrace): number {
  return (
    Number(right.topRead) - Number(left.topRead) ||
    Number(right.selected) - Number(left.selected) ||
    (right.rankScore ?? -1) - (left.rankScore ?? -1) ||
    left.itemFingerprint.localeCompare(right.itemFingerprint)
  );
}

function buildLaneFamilyHealth(
  providerKey: ProviderKey,
  laneHealth: readonly LaneTrace[],
): Record<string, LaneFamilyTrace> {
  const families = new Set([
    ...(providerKey === "x-twitter" ? xTwitterLaneFamilies : []),
    ...laneHealth.map((lane) => lane.laneFamily),
  ]);

  return Object.fromEntries(
    [...families].sort().map((family) => {
      const lanes = laneHealth.filter((lane) => lane.laneFamily === family);
      const rankedScores = lanes
        .map((lane) => lane.averageRankScore)
        .filter((score) => score > 0);

      return [
        family,
        {
          collectedCount: sumNumbers(lanes.map((lane) => lane.collectedCount)),
          rankedCount: sumNumbers(lanes.map((lane) => lane.rankedCount)),
          selectedCount: sumNumbers(lanes.map((lane) => lane.selectedCount)),
          topReadCount: sumNumbers(lanes.map((lane) => lane.topReadCount)),
          weakTopicMatchCount: sumNumbers(
            lanes.map((lane) => lane.weakTopicMatchCount),
          ),
          weakTopicMatchTopReadCount: sumNumbers(
            lanes.map((lane) => lane.weakTopicMatchTopReadCount),
          ),
          ineligibleActualTopReadCount: sumNumbers(
            lanes.map((lane) => lane.ineligibleActualTopReadCount),
          ),
          averageRankScore: averageMetric(rankedScores),
        },
      ] as const;
    }),
  );
}

function countedRecord(values: readonly string[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return Object.fromEntries([...counts.entries()].sort());
}

function sumNumbers(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function averageMetric(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return roundMetric(
    values.reduce((sum, value) => sum + value, 0) / values.length,
  );
}

function asJsonObject(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}

function validateExistingReport(): void {
  if (!existsSync(outputPath)) {
    throw new Error(
      `${outputPath} is missing and local data source is unavailable.`,
    );
  }

  const report = JSON.parse(
    readFileSync(outputPath, "utf8"),
  ) as SourceQualityTraceReport;
  const valid =
    report.schemaVersion === 1 &&
    report.artifactFormat === "reader-summary-source-quality-trace-v1" &&
    report.generatedBy ===
      "npm run check:reader-summary-source-quality-trace" &&
    report.model.liveNetwork === false &&
    report.model.rawPostTextPersistedInReport === false &&
    report.model.rawProviderPayloadPersistedInReport === false &&
    report.blockingPassed === true &&
    report.qualityGates.noRawSecretFragments === true &&
    noRawSecretFragments(report);

  if (!valid) {
    throw new Error(`${outputPath} failed existing artifact validation`);
  }

  console.log(
    `Reader summary source quality trace artifact OK (${report.collectionDate})`,
  );
}
