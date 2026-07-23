import type { SourceQueryPlan, SourceQueryPlanLane } from "../../domain";
import type { SourceQuery, SourceRuntimeConfig } from "../../ports";
import type { SourceQueryPlannerRuntimeCompilation } from "./source-query-plan-runtime-compiler";
import {
  executableLanes,
  fallbackCompilation,
  maxItemsForLane,
  readNumberParameter,
  readStringArrayFromValues,
  readStringArrayParameter,
  readStringParameter,
  skippedLaneWarnings,
  totalMaxItems,
} from "./source-query-plan-runtime-support";
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

export const compileRedditPlannedQuery = (params: {
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
