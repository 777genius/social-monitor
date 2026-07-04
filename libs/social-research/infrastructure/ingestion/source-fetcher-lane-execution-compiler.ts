import type {
  SourceQuery,
  SourceRuntimeConfig,
} from '@social-monitor/ingestion/ports';
import {
  emptyJsonObjectAsUndefined,
  normalizeJsonObject,
} from '@social-monitor/shared-kernel';

import type { SocialSearchLane } from '../../domain/value-objects/social-search-plan';
import {
  maxItemsForLane,
  totalMaxItems,
} from './source-fetcher-lane-execution-support';
import { XTwitterSourceFetcherLaneExecutionCompiler } from './source-fetcher-x-twitter-lane-execution-compiler';

export type SourceFetcherLaneExecution = {
  readonly executionId: string;
  readonly sourceKey: string;
  readonly lanes: readonly SocialSearchLane[];
  readonly sourceQuery: SourceQuery;
  readonly cursorLaneId?: string;
};

export type SourceFetcherSkippedLane = {
  readonly lane: SocialSearchLane;
  readonly reason: string;
};

export type SourceFetcherLaneExecutionPlan = {
  readonly executions: readonly SourceFetcherLaneExecution[];
  readonly skippedLanes: readonly SourceFetcherSkippedLane[];
};

export type SourceFetcherLaneExecutionCompiler = {
  compile(lanes: readonly SocialSearchLane[]): SourceFetcherLaneExecutionPlan;
};

export type SourceFetcherSourceLaneExecutionCompiler = {
  supports(sourceKey: string): boolean;
  compileSourceLanes(
    lanes: readonly SocialSearchLane[],
  ): SourceFetcherLaneExecutionPlan;
};

export class DefaultSourceFetcherLaneExecutionCompiler implements SourceFetcherLaneExecutionCompiler {
  constructor(
    private readonly sourceCompilers: readonly SourceFetcherSourceLaneExecutionCompiler[] = [],
  ) {}

  compile(lanes: readonly SocialSearchLane[]): SourceFetcherLaneExecutionPlan {
    const executions: SourceFetcherLaneExecution[] = [];
    const skippedLanes: SourceFetcherSkippedLane[] = [];

    for (const sourceLanes of lanesBySource(lanes)) {
      const sourceKey = sourceLanes[0]?.sourceKey;
      const sourceCompiler = this.sourceCompilers.find((compiler) =>
        sourceKey === undefined ? false : compiler.supports(sourceKey),
      );
      const plan =
        sourceCompiler === undefined
          ? compileOneLaneExecutions(sourceLanes)
          : sourceCompiler.compileSourceLanes(sourceLanes);

      executions.push(...plan.executions);
      skippedLanes.push(...plan.skippedLanes);
    }

    return { executions, skippedLanes };
  }
}

export class RedditSourceFetcherLaneExecutionCompiler implements SourceFetcherSourceLaneExecutionCompiler {
  supports(sourceKey: string): boolean {
    return sourceKey === 'reddit';
  }

  compileSourceLanes(
    lanes: readonly SocialSearchLane[],
  ): SourceFetcherLaneExecutionPlan {
    const scanLanes = lanes.filter((lane) => lane.operation !== 'enrichment');
    const enrichmentLanes = lanes.filter(
      (lane) => lane.operation === 'enrichment',
    );
    const allowedSubreddits = redditAllowedSubredditsFromListings(scanLanes);
    const scanPasses = scanLanes.flatMap((lane) =>
      redditScanPassForLane(lane, allowedSubreddits),
    );

    if (scanPasses.length === 0) {
      return {
        executions: [],
        skippedLanes: lanes.map((lane) => ({
          lane,
          reason: 'reddit lane is not executable as a scan pass',
        })),
      };
    }

    const primaryLane = requireFirstLane(scanLanes);
    const parameters = emptyJsonObjectAsUndefined(
      normalizeJsonObject({
        ...sourceQueryParametersForLane(primaryLane),
        maxItems: totalMaxItems(scanLanes),
        scanPasses,
        ...redditCommentExpansionParameters(enrichmentLanes),
      }),
    );

    return {
      executions: [
        {
          executionId: `reddit:scan_passes:${scanLanes
            .map((lane) => lane.laneId)
            .join('+')}`,
          sourceKey: 'reddit',
          lanes: [...scanLanes, ...enrichmentLanes],
          sourceQuery: {
            mode: 'search',
            query: primaryLane.query,
            ...(parameters === undefined ? {} : { parameters }),
          },
        },
      ],
      skippedLanes: [],
    };
  }
}

export const createDefaultSourceFetcherLaneExecutionCompiler =
  (): SourceFetcherLaneExecutionCompiler =>
    new DefaultSourceFetcherLaneExecutionCompiler([
      new RedditSourceFetcherLaneExecutionCompiler(),
      new XTwitterSourceFetcherLaneExecutionCompiler(),
    ]);

export const sourceQueryForLane = (lane: SocialSearchLane): SourceQuery => {
  const parameters = emptyJsonObjectAsUndefined(
    normalizeJsonObject(sourceQueryParametersForLane(lane)),
  );

  return {
    mode: sourceQueryModeForLane(lane),
    query: lane.query,
    ...(parameters === undefined ? {} : { parameters }),
  };
};

const compileOneLaneExecutions = (
  lanes: readonly SocialSearchLane[],
): SourceFetcherLaneExecutionPlan => ({
  executions: lanes
    .filter((lane) => lane.operation !== 'enrichment')
    .map((lane) => ({
      executionId: lane.laneId,
      sourceKey: lane.sourceKey,
      lanes: [lane],
      sourceQuery: sourceQueryForLane(lane),
      cursorLaneId: lane.laneId,
    })),
  skippedLanes: lanes
    .filter((lane) => lane.operation === 'enrichment')
    .map((lane) => ({
      lane,
      reason: 'enrichment lane is not executable yet',
    })),
});

const lanesBySource = (
  lanes: readonly SocialSearchLane[],
): readonly (readonly SocialSearchLane[])[] => {
  const grouped = new Map<string, SocialSearchLane[]>();

  for (const lane of lanes) {
    grouped.set(lane.sourceKey, [...(grouped.get(lane.sourceKey) ?? []), lane]);
  }

  return [...grouped.values()];
};

const sourceQueryModeForLane = (
  lane: SocialSearchLane,
): SourceQuery['mode'] => {
  if (lane.operation === 'listing') {
    return 'listing';
  }

  if (lane.operation === 'account_feed') {
    return 'account_feed';
  }

  if (lane.operation === 'url') {
    return 'url';
  }

  return 'search';
};

const sourceQueryParametersForLane = (
  lane: SocialSearchLane,
): Readonly<Record<string, unknown>> => ({
  ...(lane.parameters ?? {}),
  maxItems: lane.maxItems,
});

const redditScanPassForLane = (
  lane: SocialSearchLane,
  fallbackAllowedSubreddits?: readonly string[],
): readonly SourceRuntimeConfig[] => {
  if (lane.operation === 'listing') {
    const listing = redditListingFromQuery(lane.query);

    return listing === undefined
      ? []
      : [
          {
            mode: 'listing',
            subreddit: listing.subreddit,
            listing: listing.listing,
            maxItems: maxItemsForLane(lane),
            ...redditTopTimeParameters(lane),
          },
        ];
  }

  if (lane.operation !== 'search') {
    return [];
  }

  return [
    {
      mode: 'search',
      query: lane.query,
      maxItems: maxItemsForLane(lane),
      ...redditSearchParameters(lane),
      ...redditAllowedSubredditsParameters(lane, fallbackAllowedSubreddits),
    },
  ];
};

const redditListingFromQuery = (
  query: string,
): { readonly subreddit: string; readonly listing: string } | undefined => {
  const [subreddit, listing] = query.split(':');

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

const redditTopTimeParameters = (
  lane: SocialSearchLane,
): SourceRuntimeConfig => {
  const topTime = readStringParameter(lane, 'topTime');

  return topTime === undefined ? {} : { topTime };
};

const redditAllowedSubredditsParameters = (
  lane: SocialSearchLane,
  fallbackAllowedSubreddits?: readonly string[],
): SourceRuntimeConfig => {
  const allowedSubreddits =
    readStringArrayParameter(lane, 'allowedSubreddits') ??
    fallbackAllowedSubreddits;

  return allowedSubreddits === undefined ? {} : { allowedSubreddits };
};

const redditSearchParameters = (
  lane: SocialSearchLane,
): SourceRuntimeConfig => {
  const searchSort =
    readStringParameter(lane, 'searchSort') ??
    (lane.kind === 'general' ? 'new' : undefined);

  return {
    ...(searchSort === undefined ? {} : { searchSort }),
    ...optionalStringParameter(lane, 'searchTime'),
  };
};

const redditAllowedSubredditsFromListings = (
  lanes: readonly SocialSearchLane[],
): readonly string[] | undefined => {
  const subreddits = lanes.flatMap((lane) => {
    if (lane.operation !== 'listing') {
      return [];
    }

    const listing = redditListingFromQuery(lane.query);

    return listing === undefined ? [] : [listing.subreddit];
  });

  return subreddits.length === 0 ? undefined : [...new Set(subreddits)];
};

const redditCommentExpansionParameters = (
  lanes: readonly SocialSearchLane[],
): SourceRuntimeConfig => {
  if (lanes.length === 0) {
    return {};
  }

  const lane = requireFirstLane(lanes);

  return {
    includeComments: true,
    ...optionalNumberParameter(lane, 'maxCommentsPerPost'),
    ...optionalNumberParameter(lane, 'commentDepth'),
    ...optionalStringParameter(lane, 'commentSort'),
  };
};

const optionalNumberParameter = (
  lane: SocialSearchLane,
  key: string,
): SourceRuntimeConfig => {
  const value = lane.parameters?.[key];

  return typeof value === 'number' && Number.isFinite(value)
    ? { [key]: value }
    : {};
};

const optionalStringParameter = (
  lane: SocialSearchLane,
  key: string,
): SourceRuntimeConfig => {
  const value = readStringParameter(lane, key);

  return value === undefined ? {} : { [key]: value };
};

const readStringParameter = (
  lane: SocialSearchLane,
  key: string,
): string | undefined => {
  const value = lane.parameters?.[key];

  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
};

const readStringArrayParameter = (
  lane: SocialSearchLane,
  key: string,
): readonly string[] | undefined => {
  const value = lane.parameters?.[key];

  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return items.length === 0 ? undefined : items;
};

const requireFirstLane = (
  lanes: readonly SocialSearchLane[],
): SocialSearchLane => {
  const lane = lanes[0];

  if (lane === undefined) {
    throw new Error('Expected at least one social search lane.');
  }

  return lane;
};
