import type {
  SourceQueryPlan,
  SourceQueryPlanLane,
  SourceQueryPlannerAccount,
  SourceQueryPlannerCommunity,
  SourceQueryPlannerIntent,
} from "../../domain";
import type { SourceQuery, SourceRuntimeConfig } from "../../ports";
import {
  compactRuntimeConfig,
  compactUnique,
  compactUniqueBy,
  readArray,
  readBoolean,
  readOptionalPositiveInteger,
  readRecord,
  readString,
} from "./source-runtime-config-readers";
import { mergeXRuntimeQueryBudgets } from "./x-source-query-plan-runtime-budget";

export type SourceQueryPlannerRuntimeCompilation = {
  readonly sourceQuery: SourceQuery;
  readonly warnings: readonly string[];
  readonly applied: boolean;
};

export type SourceQueryPlanRuntimeCompiler = {
  compile(params: {
    readonly providerKey: string;
    readonly originalSourceQuery: SourceQuery;
    readonly runtimeConfig?: SourceRuntimeConfig;
    readonly plan: SourceQueryPlan;
  }): SourceQueryPlannerRuntimeCompilation;
};

export class DefaultSourceQueryPlanRuntimeCompiler implements SourceQueryPlanRuntimeCompiler {
  compile(params: {
    readonly providerKey: string;
    readonly originalSourceQuery: SourceQuery;
    readonly runtimeConfig?: SourceRuntimeConfig;
    readonly plan: SourceQueryPlan;
  }): SourceQueryPlannerRuntimeCompilation {
    if (params.providerKey === "reddit") {
      return compileRedditPlannedQuery(params);
    }

    if (
      params.providerKey === "x-twitter" ||
      params.providerKey === "x-twitter-experimental-daily"
    ) {
      return compileXTwitterPlannedQuery(params);
    }

    return fallbackCompilation(
      params.originalSourceQuery,
      `source_query_planner.unsupported_provider:${params.providerKey}`,
    );
  }
}

export const isSourceQueryPlannerEnabled = (
  config: SourceRuntimeConfig | undefined,
): boolean => {
  const planner = readRecord(config?.sourceQueryPlanner);

  return (
    readBoolean(planner?.enabled) ??
    readBoolean(config?.enableSourceQueryPlanner) ??
    false
  );
};

export const sourceQueryPlannerIntentFromConfig = (params: {
  readonly providerKey: string;
  readonly sourceQuery: SourceQuery;
  readonly config?: SourceRuntimeConfig;
}): SourceQueryPlannerIntent => {
  const planner = readRecord(params.config?.sourceQueryPlanner);

  return {
    topic:
      readString(planner?.topic) ??
      readString(params.config?.topic) ??
      params.sourceQuery.query,
    sourceKeys: [params.providerKey],
    products: readStringArrayFromValues(
      planner?.products,
      planner?.productTerms,
      planner?.terms,
      params.config?.queryLaneProductTerms,
      params.config?.productTerms,
      params.config?.entityTerms,
      params.config?.products,
    ),
    keywords: readStringArrayFromValues(
      planner?.keywords,
      planner?.keywordTerms,
      params.config?.queryLaneKeywords,
      params.config?.keywords,
    ),
    handles: readPlannerAccounts(params.providerKey, [
      planner?.handles,
      planner?.accounts,
      params.config?.queryLaneHandles,
      params.config?.trackedHandles,
      params.config?.handles,
    ]),
    communities: readPlannerCommunities(params.providerKey, [
      planner?.communities,
      planner?.subreddits,
      params.config?.communities,
      ...(params.providerKey === "reddit"
        ? [params.config?.allowedSubreddits, params.config?.subreddits]
        : []),
    ]),
    maxLanes: readOptionalPositiveInteger(
      planner?.maxLanes ?? params.config?.maxQueryPlannerLanes,
    ),
    maxLanesPerSource: readOptionalPositiveInteger(
      planner?.maxLanesPerSource ?? params.config?.maxLanesPerSource,
    ),
    maxItemsPerLane: readOptionalPositiveInteger(
      planner?.maxItemsPerLane ?? params.config?.maxItemsPerLane,
    ),
    includeEnrichment:
      readBoolean(planner?.includeEnrichment) ??
      readBoolean(params.config?.includeQueryPlannerEnrichment),
  };
};

const compileRedditPlannedQuery = (params: {
  readonly originalSourceQuery: SourceQuery;
  readonly runtimeConfig?: SourceRuntimeConfig;
  readonly plan: SourceQueryPlan;
}): SourceQueryPlannerRuntimeCompilation => {
  const sourceLanes = executableLanes(params.plan, "reddit");
  const scanLanes = sourceLanes.filter(
    (lane) => lane.operation !== "enrichment",
  );
  const enrichmentLanes = sourceLanes.filter(
    (lane) => lane.operation === "enrichment",
  );
  const baselineScanPasses = redditBaselineScanPassesFromConfig(
    params.runtimeConfig,
  );
  const allowedSubreddits = redditAllowedSubredditsForPlan(
    scanLanes,
    params.runtimeConfig,
  );
  const scanPasses = mergeRedditScanPasses(
    scanLanes.flatMap((lane) => redditScanPassForLane(lane, allowedSubreddits)),
    baselineScanPasses,
  );
  const primaryLane = scanLanes[0];

  if (scanPasses.length === 0 || primaryLane === undefined) {
    return fallbackCompilation(
      params.originalSourceQuery,
      "source_query_planner.no_reddit_scan_passes",
    );
  }

  return {
    sourceQuery: {
      mode: "search",
      query: primaryLane.query,
      parameters: compactRuntimeConfig({
        maxItems: redditCompilationMaxItems(scanLanes, params.runtimeConfig),
        scanPasses,
        ...redditCommentExpansionParameters(enrichmentLanes),
      }),
    },
    warnings: skippedLaneWarnings(sourceLanes, scanPasses.length),
    applied: true,
  };
};

const compileXTwitterPlannedQuery = (params: {
  readonly originalSourceQuery: SourceQuery;
  readonly runtimeConfig?: SourceRuntimeConfig;
  readonly plan: SourceQueryPlan;
}): SourceQueryPlannerRuntimeCompilation => {
  const sourceLanes = executableLanes(params.plan, "x-twitter").filter((lane) =>
    ["search", "account_feed", "mention_search"].includes(lane.operation),
  );
  const maxQueries = Math.min(
    readOptionalPositiveInteger(
      readRecord(params.runtimeConfig?.sourceQueryPlanner)?.maxSearchQueries ??
        params.runtimeConfig?.maxSearchQueries,
    ) ?? 16,
    16,
  );
  const plannedQueryBudgets = xSearchQueryBudgets(
    sourceLanes,
    sourceLanes.length,
  );
  const mergedQueryBudgets = mergeXRuntimeQueryBudgets(
    plannedQueryBudgets,
    params.runtimeConfig,
    maxQueries,
  );
  const queryBudgets = mergedQueryBudgets.budgets;
  const searchQueries = queryBudgets.map((budget) => budget.query);
  const primaryLane = sourceLanes[0];

  if (searchQueries.length === 0 || primaryLane === undefined) {
    return fallbackCompilation(
      params.originalSourceQuery,
      "source_query_planner.no_x_search_queries",
    );
  }

  return {
    sourceQuery: {
      mode: "search",
      query: queryBudgets[0]?.query ?? primaryLane.query,
      parameters: compactRuntimeConfig({
        maxItems: mergedQueryBudgets.maxItems,
        maxSearchQueries: searchQueries.length,
        searchQueries,
        searchQueryBudgets: queryBudgets.map((budget) => ({
          query: budget.query,
          maxItems: budget.maxItems,
        })),
      }),
    },
    warnings: mergedQueryBudgets.capped
      ? ["source_query_planner.x_search_queries_capped"]
      : [],
    applied: true,
  };
};

const executableLanes = (
  plan: SourceQueryPlan,
  providerKey: string,
): readonly SourceQueryPlanLane[] =>
  plan.lanes.filter((lane) => lane.sourceKey === providerKey);

const redditScanPassForLane = (
  lane: SourceQueryPlanLane,
  fallbackAllowedSubreddits?: readonly string[],
): readonly SourceRuntimeConfig[] => {
  if (lane.operation === "listing") {
    const listing = redditListingFromQuery(lane.query);

    return listing === undefined
      ? []
      : [
          compactRuntimeConfig({
            mode: "listing",
            subreddit: listing.subreddit,
            listing: listing.listing,
            maxItems: maxItemsForLane(lane),
            topTime: readStringParameter(lane, "topTime"),
          }),
        ];
  }

  if (lane.operation !== "search") {
    return [];
  }

  return [
    compactRuntimeConfig({
      mode: "search",
      query: lane.query,
      maxItems: maxItemsForLane(lane),
      searchSort:
        readStringParameter(lane, "searchSort") ??
        (lane.kind === "general" ? "new" : undefined),
      searchTime: readStringParameter(lane, "searchTime"),
      allowedSubreddits:
        readStringArrayParameter(lane, "allowedSubreddits") ??
        fallbackAllowedSubreddits,
    }),
  ];
};

const redditBaselineScanPassesFromConfig = (
  runtimeConfig: SourceRuntimeConfig | undefined,
): readonly SourceRuntimeConfig[] =>
  readArray(runtimeConfig?.scanPasses).flatMap((pass) => {
    const record = readRecord(pass);
    const mode = readString(record?.mode) ?? "listing";

    if (mode === "listing") {
      const subreddit = readString(record?.subreddit ?? record?.query);
      if (subreddit === undefined) {
        return [];
      }

      return [
        compactRuntimeConfig({
          mode: "listing",
          subreddit,
          listing: readString(record?.listing) ?? "top",
          topTime: readString(record?.topTime),
          maxItems: readFiniteNumber(record?.maxItems),
          minScore: readFiniteNumber(record?.minScore),
          includeComments: readBoolean(record?.includeComments),
          maxCommentsPerPost: readFiniteNumber(record?.maxCommentsPerPost),
        }),
      ];
    }

    if (mode !== "search") {
      return [];
    }

    const query = readString(record?.query);
    if (query === undefined) {
      return [];
    }

    return [
      compactRuntimeConfig({
        mode: "search",
        query,
        searchSort: readString(record?.searchSort),
        searchTime: readString(record?.searchTime),
        maxItems: readFiniteNumber(record?.maxItems),
        minScore: readFiniteNumber(record?.minScore),
        includeComments: readBoolean(record?.includeComments),
        maxCommentsPerPost: readFiniteNumber(record?.maxCommentsPerPost),
        allowedSubreddits: readStringArrayFromValues(
          record?.allowedSubreddits,
          record?.subreddits,
        ),
      }),
    ];
  });

const mergeRedditScanPasses = (
  planned: readonly SourceRuntimeConfig[],
  baseline: readonly SourceRuntimeConfig[],
): readonly SourceRuntimeConfig[] =>
  compactUniqueBy([...planned, ...baseline], redditScanPassKey);

const redditScanPassKey = (pass: SourceRuntimeConfig): string => {
  const mode = readString(pass.mode) ?? "listing";
  if (mode === "search") {
    return [
      "search",
      readString(pass.query) ?? "",
      readString(pass.searchSort) ?? "",
      readString(pass.searchTime) ?? "",
      readStringArrayFromValues(pass.allowedSubreddits, pass.subreddits)
        .map((subreddit) => subreddit.toLowerCase())
        .join(","),
    ].join(":");
  }

  return [
    "listing",
    (readString(pass.subreddit ?? pass.query) ?? "").toLowerCase(),
    readString(pass.listing) ?? "top",
    readString(pass.topTime) ?? "",
  ].join(":");
};

const redditCompilationMaxItems = (
  lanes: readonly SourceQueryPlanLane[],
  runtimeConfig: SourceRuntimeConfig | undefined,
): number => {
  const configuredMaxItems = readOptionalPositiveInteger(
    runtimeConfig?.maxItems,
  );

  return Math.min(100, Math.max(totalMaxItems(lanes), configuredMaxItems ?? 1));
};

const readFiniteNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const redditListingFromQuery = (
  query: string,
): { readonly subreddit: string; readonly listing: string } | undefined => {
  const [subreddit, listing] = query.split(":");

  if (
    subreddit === undefined ||
    subreddit.trim().length === 0 ||
    listing === undefined ||
    listing.trim().length === 0
  ) {
    return undefined;
  }

  return {
    subreddit: subreddit.trim(),
    listing: listing.trim(),
  };
};

const redditAllowedSubredditsForPlan = (
  lanes: readonly SourceQueryPlanLane[],
  runtimeConfig: SourceRuntimeConfig | undefined,
): readonly string[] | undefined => {
  const subreddits = [
    ...redditAllowedSubredditsFromConfig(runtimeConfig),
    ...lanes.flatMap((lane) => {
      if (lane.operation !== "listing") {
        return [];
      }

      const listing = redditListingFromQuery(lane.query);

      return listing === undefined ? [] : [listing.subreddit];
    }),
  ];

  return subreddits.length === 0 ? undefined : compactUnique(subreddits);
};

const redditAllowedSubredditsFromConfig = (
  runtimeConfig: SourceRuntimeConfig | undefined,
): readonly string[] => [
  ...readStringArrayFromValues(runtimeConfig?.allowedSubreddits),
  ...readArray(runtimeConfig?.scanPasses).flatMap((pass) => {
    const record = readRecord(pass);
    const mode = readString(record?.mode) ?? "listing";
    const subreddit = readString(record?.subreddit ?? record?.query);

    if (mode === "search") {
      return readStringArrayFromValues(record?.allowedSubreddits);
    }

    return mode === "listing" && subreddit !== undefined ? [subreddit] : [];
  }),
];

const redditCommentExpansionParameters = (
  lanes: readonly SourceQueryPlanLane[],
): SourceRuntimeConfig => {
  const lane = lanes[0];

  if (lane === undefined) {
    return {};
  }

  return compactRuntimeConfig({
    includeComments: true,
    maxCommentedPosts: maxItemsForLane(lane),
    maxCommentsPerPost: readNumberParameter(lane, "maxCommentsPerPost"),
    commentDepth: readNumberParameter(lane, "commentDepth"),
    commentSort: readStringParameter(lane, "commentSort"),
  });
};

const xSearchQueryBudgets = (
  lanes: readonly SourceQueryPlanLane[],
  maxQueries: number,
): readonly { readonly query: string; readonly maxItems: number }[] => {
  const budgetsByQuery = new Map<string, number>();
  const orderedQueries: string[] = [];

  for (const lane of lanes) {
    const query = lane.query.trim();
    if (query.length === 0) {
      continue;
    }

    if (!budgetsByQuery.has(query)) {
      orderedQueries.push(query);
    }

    budgetsByQuery.set(
      query,
      Math.max(budgetsByQuery.get(query) ?? 0, maxItemsForLane(lane)),
    );
  }

  return orderedQueries.slice(0, maxQueries).map((query) => ({
    query,
    maxItems: budgetsByQuery.get(query) ?? 1,
  }));
};

const skippedLaneWarnings = (
  lanes: readonly SourceQueryPlanLane[],
  executableCount: number,
): readonly string[] =>
  executableCount >=
  lanes.filter((lane) => lane.operation !== "enrichment").length
    ? []
    : ["source_query_planner.some_lanes_skipped"];

const fallbackCompilation = (
  sourceQuery: SourceQuery,
  warning: string,
): SourceQueryPlannerRuntimeCompilation => ({
  sourceQuery,
  warnings: [warning],
  applied: false,
});

const readPlannerAccounts = (
  defaultSourceKey: string,
  values: readonly unknown[],
): readonly SourceQueryPlannerAccount[] =>
  compactUniqueBy(
    values.flatMap(readArray).flatMap((value) => {
      const handle = readString(value);
      if (handle !== undefined) {
        return [
          {
            handle,
            sourceKey: defaultSourceKey,
            includePosts: true,
            includeMentions: true,
          },
        ];
      }

      const record = readRecord(value);
      const recordHandle = readString(record?.handle);
      if (recordHandle === undefined) {
        return [];
      }

      return [
        {
          handle: recordHandle,
          sourceKey: readString(record?.sourceKey) ?? defaultSourceKey,
          includePosts: readBoolean(record?.includePosts),
          includeMentions: readBoolean(record?.includeMentions),
        },
      ];
    }),
    (account) => `${account.sourceKey ?? "*"}:${account.handle}`,
  );

const readPlannerCommunities = (
  defaultSourceKey: string,
  values: readonly unknown[],
): readonly SourceQueryPlannerCommunity[] =>
  compactUniqueBy(
    values.flatMap(readArray).flatMap((value) => {
      const name = readString(value);
      if (name !== undefined) {
        return [{ name, sourceKey: defaultSourceKey }];
      }

      const record = readRecord(value);
      const recordName = readString(record?.name);
      if (recordName === undefined) {
        return [];
      }

      return [
        {
          name: recordName,
          sourceKey: readString(record?.sourceKey) ?? defaultSourceKey,
          listings: readCommunityListings(record?.listings),
        },
      ];
    }),
    (community) => `${community.sourceKey ?? "*"}:${community.name}`,
  );

const readCommunityListings = (
  value: unknown,
): SourceQueryPlannerCommunity["listings"] => {
  const listings: NonNullable<SourceQueryPlannerCommunity["listings"]> =
    readArray(value).flatMap((item) => {
      const listing = readString(item);

      return isCommunityListing(listing) ? [listing] : [];
    });

  return listings.length === 0 ? undefined : compactUnique(listings);
};

const isCommunityListing = (
  value: string | undefined,
): value is NonNullable<SourceQueryPlannerCommunity["listings"]>[number] =>
  value === "top" || value === "hot" || value === "new";

const readStringArrayFromValues = (
  ...values: readonly unknown[]
): readonly string[] =>
  compactUnique(
    values.flatMap(readArray).flatMap((value) => {
      const text = readString(value);

      return text === undefined ? [] : [text];
    }),
  );

const readStringArrayParameter = (
  lane: SourceQueryPlanLane,
  key: string,
): readonly string[] | undefined => {
  const value = lane.parameters?.[key];

  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value.flatMap((item) => {
    const text = readString(item);

    return text === undefined ? [] : [text];
  });

  return items.length === 0 ? undefined : compactUnique(items);
};

const readStringParameter = (
  lane: SourceQueryPlanLane,
  key: string,
): string | undefined => readString(lane.parameters?.[key]);

const readNumberParameter = (
  lane: SourceQueryPlanLane,
  key: string,
): number | undefined => {
  const value = lane.parameters?.[key];

  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
};

const totalMaxItems = (lanes: readonly SourceQueryPlanLane[]): number =>
  Math.max(
    1,
    Math.min(
      100,
      lanes.reduce((total, lane) => total + maxItemsForLane(lane), 0),
    ),
  );

const maxItemsForLane = (lane: SourceQueryPlanLane): number =>
  Math.max(1, Math.min(100, lane.maxItems));
