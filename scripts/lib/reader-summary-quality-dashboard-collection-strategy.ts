import type { Pool } from "pg";

import { SocialResearchSourceQueryPlannerAdapter } from "@social-monitor/ingestion/adapters/source/social-research-source-query-planner.adapter";
import {
  DefaultSourceQueryPlanRuntimeCompiler,
  sourceQueryPlannerIntentFromConfig,
} from "@social-monitor/ingestion/adapters/source/source-query-plan-runtime-compiler";
import type {
  SourceQuery,
  SourceQueryMode,
  SourceRuntimeConfig,
} from "@social-monitor/ingestion/ports";
import type { ReaderSummaryArtifactView } from "@social-monitor/summary/features/shared/reader-summary-artifact-presenter";

import { productionCollectionThresholds } from "./production-collection-quality-policy";
import type {
  CollectionStrategyReport,
  PlannerCanaryLaneReport,
  PlannerCanaryReport,
  PlannerCanarySourceReport,
  PlannerRolloutProofDateReport,
  PlannerRolloutProofReport,
  PrimarySourceStrategyReport,
  ReaderSummaryQualityDayReport,
} from "./reader-summary-quality-dashboard-contract";
import type { DashboardFeedItemRow } from "./reader-summary-quality-dashboard-published-window";
import {
  dashboardProviderSourceKey,
  dashboardSourceProduct,
} from "./reader-summary-quality-dashboard-source-attribution";
import {
  isEligiblePrimaryTopReadInput,
  primarySummaryRepresentationEnough,
  readerFacingPrimaryCandidateCount,
} from "./reader-summary-primary-source-quality";
import {
  asRecord,
  countBy,
  isDefined,
  providerSkew,
  readMetadataString,
  type ReaderSummaryQualityScope,
  stringValue,
} from "./reader-summary-quality-eval-support";
import {
  fingerprint,
  message,
} from "./yesterday-social-replay-support";

type SourceBindingRow = {
  readonly id: string;
  readonly interestId: string;
  readonly providerKey: string;
  readonly config: unknown;
};

export async function buildCollectionStrategy(params: {
  readonly pool: Pool;
  readonly scope: ReaderSummaryQualityScope;
  readonly feedItems: readonly DashboardFeedItemRow[];
  readonly view: ReaderSummaryArtifactView | undefined;
}): Promise<CollectionStrategyReport> {
  const reddit = buildPrimarySourceStrategy(
    "reddit",
    params.feedItems,
    params.view,
  );
  const xTwitter = buildPrimarySourceStrategy(
    "x-twitter",
    params.feedItems,
    params.view,
  );
  const primaryReports = {
    reddit,
    "x-twitter": xTwitter,
  };
  const plannerCanary = await buildPlannerCanaryReport({
    pool: params.pool,
    scope: params.scope,
    feedItems: params.feedItems,
    primaryReports,
  });
  const gates = {
    redditCollectedEnough: reddit.collectedCount >= 25,
    xTwitterCollectedEnough:
      xTwitter.collectedCount >=
      productionCollectionThresholds.xTwitterCollectedFeedItems,
    redditEligibleCandidatesEnough: reddit.eligibleTopReadCandidateCount >= 8,
    xTwitterEligibleCandidatesEnough:
      xTwitter.eligibleTopReadCandidateCount >= 8,
    redditSummaryRepresentationEnough:
      primarySummaryRepresentationEnough(reddit),
    xTwitterSummaryRepresentationEnough:
      primarySummaryRepresentationEnough(xTwitter),
    redditSourceSkewControlled: reddit.sourceSkewRatio <= 0.75,
    xTwitterSourceSkewControlled: xTwitter.sourceSkewRatio <= 0.75,
  };
  const warningSignals = {
    redditQueryLanesMissing: reddit.queryLaneCount < 2,
    xTwitterQueryLanesMissing: xTwitter.queryLaneCount < 2,
    redditTopNewLatestMixMissing: reddit.productLaneCount < 2,
    xTwitterTopNewLatestMixMissing: xTwitter.productLaneCount < 2,
    redditNotCollectedForEveryInterest: !reddit.collectedForEveryInterest,
    xTwitterNotCollectedForEveryInterest: !xTwitter.collectedForEveryInterest,
  };

  return {
    primarySources: primaryReports,
    plannerCanary,
    gates,
    warningSignals,
  };
}

export function buildPlannerRolloutProof(
  days: readonly ReaderSummaryQualityDayReport[],
): PlannerRolloutProofReport {
  const dateReports = days.map(plannerRolloutProofForDay);
  const eligibleCleanDates = dateReports
    .filter((item) => item.reasons.length === 0)
    .map((item) => item.collectionDate);
  const cleanCollectionAvailable = dateReports.some(
    (item) => item.cleanCollection,
  );
  const status =
    eligibleCleanDates.length > 0
      ? "ready"
      : cleanCollectionAvailable
        ? "missing_clean_rollout_proof"
        : "missing_clean_collection";

  return {
    status,
    latestEligibleCleanDate: eligibleCleanDates.at(-1),
    eligibleCleanDates,
    blockedDates: dateReports.filter((item) => item.reasons.length > 0),
    gates: {
      cleanCollectionAvailable,
      realPlannerRolloutProofAvailable: status === "ready",
      dirtyDaysExcludedFromRolloutProof: dateReports
        .filter((item) => !item.cleanCollection)
        .every((item) => item.reasons.includes("dirty_collection")),
    },
  };
}

function plannerRolloutProofForDay(
  day: ReaderSummaryQualityDayReport,
): PlannerRolloutProofDateReport {
  const reddit = day.collectionStrategy.plannerCanary.primarySources.reddit;
  const xTwitter =
    day.collectionStrategy.plannerCanary.primarySources["x-twitter"];
  const cleanCollection = day.collectionIntegrity.status === "clean";
  const redditObservedLaneFingerprintCount =
    reddit?.observedLaneFingerprintCount ?? 0;
  const xTwitterObservedLaneFingerprintCount =
    xTwitter?.observedLaneFingerprintCount ?? 0;
  const redditExecutedLaneCount = reddit?.executedLaneCount ?? 0;
  const xTwitterExecutedLaneCount = xTwitter?.executedLaneCount ?? 0;
  const redditExecutableLaneCount = reddit?.executableLaneCount ?? 0;
  const xTwitterExecutableLaneCount = xTwitter?.executableLaneCount ?? 0;
  const redditLaneMetadataPresent = redditObservedLaneFingerprintCount > 0;
  const xTwitterLaneMetadataPresent = xTwitterObservedLaneFingerprintCount > 0;
  const reasons: string[] = [];

  if (!cleanCollection) {
    reasons.push("dirty_collection");
  }
  if (!redditLaneMetadataPresent) {
    reasons.push("reddit_lane_metadata_missing");
  }
  if (!xTwitterLaneMetadataPresent) {
    reasons.push("x_twitter_lane_metadata_missing");
  }
  if (redditLaneMetadataPresent && redditExecutedLaneCount === 0) {
    reasons.push("reddit_lanes_not_executed");
  }
  if (xTwitterLaneMetadataPresent && xTwitterExecutedLaneCount === 0) {
    reasons.push("x_twitter_lanes_not_executed");
  }
  if (
    redditLaneMetadataPresent &&
    redditExecutableLaneCount > 0 &&
    redditExecutedLaneCount / redditExecutableLaneCount < 0.5
  ) {
    reasons.push("reddit_execution_under_planned_half");
  }
  if (
    xTwitterLaneMetadataPresent &&
    xTwitterExecutableLaneCount > 0 &&
    xTwitterExecutedLaneCount / xTwitterExecutableLaneCount < 0.5
  ) {
    reasons.push("x_twitter_execution_under_planned_half");
  }

  return {
    collectionDate: day.collectionDate,
    cleanCollection,
    redditLaneMetadataPresent,
    xTwitterLaneMetadataPresent,
    redditExecutedLaneCount,
    xTwitterExecutedLaneCount,
    reasons,
  };
}

async function buildPlannerCanaryReport(params: {
  readonly pool: Pool;
  readonly scope: ReaderSummaryQualityScope;
  readonly feedItems: readonly DashboardFeedItemRow[];
  readonly primaryReports: Record<string, PrimarySourceStrategyReport>;
}): Promise<PlannerCanaryReport> {
  const bindings = await readPrimarySourceBindings(params.pool, params.scope);
  const reddit = await buildPlannerCanarySourceReport({
    providerKey: "reddit",
    bindings,
    feedItems: params.feedItems,
    primaryReport: params.primaryReports.reddit,
  });
  const xTwitter = await buildPlannerCanarySourceReport({
    providerKey: "x-twitter",
    bindings,
    feedItems: params.feedItems,
    primaryReport: params.primaryReports["x-twitter"],
  });

  return {
    mode: "shadow_config_preview",
    primarySources: {
      reddit,
      "x-twitter": xTwitter,
    },
    gates: {
      redditPlannerPreviewAvailable:
        reddit.canaryEnabledBindingCount > 0 && reddit.plannedLaneCount > 0,
      xTwitterPlannerPreviewAvailable:
        xTwitter.canaryEnabledBindingCount > 0 && xTwitter.plannedLaneCount > 0,
    },
    warningSignals: {
      redditPlannedLanesNotExecuted:
        reddit.observedLaneFingerprintCount > 0 &&
        reddit.plannedLaneCount > 0 &&
        reddit.executedLaneCount === 0,
      xTwitterPlannedLanesNotExecuted:
        xTwitter.observedLaneFingerprintCount > 0 &&
        xTwitter.plannedLaneCount > 0 &&
        xTwitter.executedLaneCount === 0,
      redditLaneMetadataMissing:
        reddit.collectedCount > 0 && reddit.observedLaneFingerprintCount === 0,
      xTwitterLaneMetadataMissing:
        xTwitter.collectedCount > 0 &&
        xTwitter.observedLaneFingerprintCount === 0,
      redditExecutionUnderPlannedHalf:
        reddit.observedLaneFingerprintCount > 0 &&
        reddit.executableLaneCount > 0 &&
        reddit.executedLaneCount / reddit.executableLaneCount < 0.5,
      xTwitterExecutionUnderPlannedHalf:
        xTwitter.observedLaneFingerprintCount > 0 &&
        xTwitter.executableLaneCount > 0 &&
        xTwitter.executedLaneCount / xTwitter.executableLaneCount < 0.5,
    },
  };
}

async function buildPlannerCanarySourceReport(params: {
  readonly providerKey: "reddit" | "x-twitter";
  readonly bindings: readonly SourceBindingRow[];
  readonly feedItems: readonly DashboardFeedItemRow[];
  readonly primaryReport: PrimarySourceStrategyReport | undefined;
}): Promise<PlannerCanarySourceReport> {
  const planner = new SocialResearchSourceQueryPlannerAdapter();
  const compiler = new DefaultSourceQueryPlanRuntimeCompiler();
  const providerBindings = params.bindings.filter(
    (binding) => binding.providerKey === params.providerKey,
  );
  const providerFeedItems = params.feedItems.filter(
    (item) => item.providerKey === params.providerKey,
  );
  const executedLaneFingerprints = executedLaneFingerprintsForProvider(
    params.providerKey,
    providerFeedItems,
  );
  const executedLaneSet = new Set(executedLaneFingerprints);
  const laneReports: PlannerCanaryLaneReport[] = [];
  const warnings: string[] = [];
  let plannedBudget = 0;
  let compiledAppliedCount = 0;
  let compiledSearchQueryCount = 0;
  let compiledScanPassCount = 0;

  for (const binding of providerBindings) {
    const runtimeConfig = canaryPlannerConfig(
      params.providerKey,
      binding.config,
    );
    const sourceQuery = sourceQueryFromBinding(binding);

    try {
      const plan = await planner.compilePlan({
        intent: sourceQueryPlannerIntentFromConfig({
          providerKey: params.providerKey,
          sourceQuery,
          config: runtimeConfig,
        }),
      });
      const compiled = compiler.compile({
        providerKey: params.providerKey,
        originalSourceQuery: sourceQuery,
        runtimeConfig,
        plan,
      });

      if (compiled.applied) {
        compiledAppliedCount += 1;
      }
      compiledSearchQueryCount += readRuntimeArray(
        compiled.sourceQuery.parameters?.searchQueries,
      ).length;
      compiledScanPassCount += readRuntimeArray(
        compiled.sourceQuery.parameters?.scanPasses,
      ).length;
      warnings.push(...plan.warnings, ...compiled.warnings);

      for (const lane of plan.lanes.filter(
        (lane) => lane.sourceKey === params.providerKey,
      )) {
        const queryFingerprint = plannerLaneQueryFingerprint(lane.query);
        plannedBudget += lane.maxItems;
        laneReports.push({
          laneFingerprint: fingerprint(
            `${params.providerKey}:${lane.kind}:${lane.operation}:${lane.query}`,
          ),
          kind: lane.kind,
          operation: lane.operation,
          maxItems: lane.maxItems,
          queryFingerprint,
          executionState: plannerLaneExecutionState({
            queryFingerprint,
            executedLaneSet,
            observedLaneFingerprintCount: executedLaneFingerprints.length,
            collectedCount: providerFeedItems.length,
          }),
        });
      }
    } catch (error) {
      warnings.push(
        `source_query_planner.canary_preview_failed:${fingerprint(
          message(error),
        )}`,
      );
    }
  }

  return {
    bindingCount: providerBindings.length,
    canaryEnabledBindingCount: providerBindings.length,
    plannedLaneCount: laneReports.length,
    executableLaneCount: laneReports.filter(
      (lane) => lane.operation !== "enrichment",
    ).length,
    executedLaneCount: laneReports.filter(
      (lane) => lane.executionState === "executed",
    ).length,
    observedLaneFingerprintCount: executedLaneFingerprints.length,
    plannedBudget,
    compiledAppliedCount,
    compiledSearchQueryCount,
    compiledScanPassCount,
    collectedCount:
      params.primaryReport?.collectedCount ?? providerFeedItems.length,
    selectedCount: params.primaryReport?.selectedCount ?? 0,
    topReadCount: params.primaryReport?.topReadCount ?? 0,
    lanes: laneReports,
    executedLaneFingerprints,
    warnings: uniqueStrings(warnings),
  };
}

function buildPrimarySourceStrategy(
  providerKey: "reddit" | "x-twitter",
  feedItems: readonly DashboardFeedItemRow[],
  view: ReaderSummaryArtifactView | undefined,
): PrimarySourceStrategyReport {
  const providerItems = feedItems.filter(
    (item) => item.providerKey === providerKey,
  );
  const allInterestIds = new Set(feedItems.map((item) => item.interestId));
  const countsByInterest = countBy(providerItems, (item) => item.interestId);
  const sourceBindingCount = new Set(
    providerItems.map((item) => item.sourceBindingId),
  ).size;
  const queryLaneCount = new Set(
    providerItems
      .map(
        (item) =>
          sourceQueryLaneQuery(asRecord(item.providerMetadata)) ??
          readMetadataString(item.providerMetadata, "searchQuery"),
      )
      .filter(isDefined),
  ).size;
  const productLaneCount = new Set(
    providerItems
      .map((item) => dashboardSourceProduct(item.providerMetadata))
      .filter(isDefined),
  ).size;
  const sourceCounts = countBy(providerItems, (item) =>
    dashboardProviderSourceKey(providerKey, item),
  );
  const selectedCount =
    view?.coverage.providerBreakdown.find(
      (item) => item.providerKey === providerKey,
    )?.selectedFeedItemCount ?? 0;
  const topReadCount =
    view?.content.topReads.filter((item) => item.providerKey === providerKey)
      .length ?? 0;
  const readerFacingTopReadCandidateCount = readerFacingPrimaryCandidateCount({
    providerKey,
    selectedPosts: view?.content.selectedPosts ?? [],
  });

  return {
    collectedCount: providerItems.length,
    selectedCount,
    topReadCount,
    interestCount: countsByInterest.length,
    collectedForEveryInterest:
      allInterestIds.size > 0 &&
      [...allInterestIds].every((interestId) =>
        providerItems.some((item) => item.interestId === interestId),
      ),
    minCollectedPerInterest:
      allInterestIds.size === 0
        ? 0
        : Math.min(
            ...[...allInterestIds].map(
              (interestId) =>
                countsByInterest.find((item) => item.providerKey === interestId)
                  ?.count ?? 0,
            ),
          ),
    sourceBindingCount,
    queryLaneCount: Math.max(queryLaneCount, sourceBindingCount),
    productLaneCount,
    eligibleTopReadCandidateCount: providerItems.filter(
      isEligiblePrimaryTopReadInput,
    ).length,
    readerFacingTopReadCandidateCount,
    sourceSkewRatio: providerSkew(sourceCounts.map((item) => item.count)),
    topSourceFingerprints: sourceCounts
      .slice(0, 5)
      .map((item) => fingerprint(`${providerKey}:${item.providerKey}`)),
  };
}

async function readPrimarySourceBindings(
  pool: Pool,
  scope: ReaderSummaryQualityScope,
): Promise<readonly SourceBindingRow[]> {
  const result = await pool.query<SourceBindingRow>(
    `
      select
        sb.id::text as "id",
        sb.interest_id::text as "interestId",
        sce.provider_key as "providerKey",
        sb.config as "config"
      from source_bindings sb
      join source_catalog_entries sce
        on sce.id = sb.source_catalog_entry_id
      where sb.tenant_id = $1::uuid
        and sb.workspace_id = $2::uuid
        and sb.deleted_at is null
        and sb.status = 'ENABLED'
        and sce.provider_key in ('reddit', 'x-twitter')
      order by sce.provider_key, sb.created_at, sb.id
    `,
    [scope.tenantId, scope.workspaceId],
  );

  return result.rows;
}

function canaryPlannerConfig(
  providerKey: "reddit" | "x-twitter",
  value: unknown,
): SourceRuntimeConfig {
  const config = asRecord(value);
  const planner = asRecord(config.sourceQueryPlanner);

  return {
    ...(config as SourceRuntimeConfig),
    sourceQueryPlanner: {
      ...(planner as SourceRuntimeConfig),
      enabled: true,
      maxLanesPerSource: 8,
      maxItemsPerLane: 25,
      includeEnrichment: providerKey === "reddit",
      ...(providerKey === "x-twitter" ? { maxSearchQueries: 8 } : {}),
    },
  };
}

function sourceQueryFromBinding(binding: SourceBindingRow): SourceQuery {
  const config = asRecord(binding.config);

  return {
    mode: sourceQueryModeFromValue(config.mode),
    query:
      stringValue(config.query) ??
      stringValue(config.term) ??
      stringValue(config.topic) ??
      stringValue(config.subreddit) ??
      binding.providerKey,
    parameters: config as SourceRuntimeConfig,
  };
}

function executedLaneFingerprintsForProvider(
  providerKey: "reddit" | "x-twitter",
  feedItems: readonly DashboardFeedItemRow[],
): readonly string[] {
  return uniqueStrings(
    feedItems.flatMap((item) => {
      const metadata = asRecord(item.providerMetadata);
      const laneQuery = sourceQueryLaneQuery(metadata);
      if (laneQuery !== undefined) {
        return [plannerLaneQueryFingerprint(laneQuery)];
      }

      const searchQuery = readMetadataString(metadata, "searchQuery");
      if (searchQuery !== undefined) {
        return [plannerLaneQueryFingerprint(searchQuery)];
      }

      if (providerKey === "reddit") {
        const subreddit = readMetadataString(metadata, "subreddit");
        const listing =
          readMetadataString(metadata, "listing") ??
          dashboardSourceProduct(metadata);
        if (subreddit !== undefined && listing !== undefined) {
          return [plannerLaneQueryFingerprint(`${subreddit}:${listing}`)];
        }
      }

      const product = dashboardSourceProduct(metadata);

      return product === undefined
        ? []
        : [plannerLaneQueryFingerprint(product)];
    }),
  );
}

function plannerLaneQueryFingerprint(query: string): string {
  return fingerprint(query.trim().toLowerCase());
}

function sourceQueryLaneQuery(
  metadata: Readonly<Record<string, unknown>>,
): string | undefined {
  const lane = asRecord(metadata.sourceQueryLane);

  return readMetadataString(lane, "query");
}

export function plannerLaneExecutionState(params: {
  readonly queryFingerprint: string;
  readonly executedLaneSet: ReadonlySet<string>;
  readonly observedLaneFingerprintCount: number;
  readonly collectedCount: number;
}): PlannerCanaryLaneReport["executionState"] {
  if (params.executedLaneSet.has(params.queryFingerprint)) {
    return "executed";
  }

  return params.collectedCount > 0 && params.observedLaneFingerprintCount === 0
    ? "not_observable"
    : "not_seen_in_feed";
}

function readRuntimeArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function sourceQueryModeFromValue(value: unknown): SourceQueryMode {
  const mode = stringValue(value);

  return mode === "listing" ||
    mode === "account_feed" ||
    mode === "thread" ||
    mode === "url"
    ? mode
    : "search";
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}
