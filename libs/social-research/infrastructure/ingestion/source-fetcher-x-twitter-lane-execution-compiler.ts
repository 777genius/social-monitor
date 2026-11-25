import type { SourceRuntimeConfig } from '@social-monitor/ingestion/ports';
import {
  emptyJsonObjectAsUndefined,
  normalizeJsonObject,
} from '@social-monitor/shared-kernel';

import type { SocialSearchLane } from '../../domain/value-objects/social-search-plan';
import type {
  SourceFetcherLaneExecutionPlan,
  SourceFetcherSourceLaneExecutionCompiler,
} from './source-fetcher-lane-execution-compiler';
import { totalMaxItems } from './source-fetcher-lane-execution-support';

export class XTwitterSourceFetcherLaneExecutionCompiler
  implements SourceFetcherSourceLaneExecutionCompiler
{
  supports(sourceKey: string): boolean {
    return (
      sourceKey === 'x-twitter' || sourceKey === 'x-twitter-experimental-daily'
    );
  }

  compileSourceLanes(
    lanes: readonly SocialSearchLane[],
  ): SourceFetcherLaneExecutionPlan {
    const selected = selectXTwitterSearchLanes(lanes);
    const primaryLane = selected.lanes[0];

    if (primaryLane === undefined || selected.searchQueries.length === 0) {
      return {
        executions: [],
        skippedLanes: lanes.map((lane) => ({
          lane,
          reason: 'x-twitter lane is not executable as a search query',
        })),
      };
    }

    const parameters = xTwitterSearchParameters(selected);

    return {
      executions: [
        {
          executionId: `x-twitter:search_queries:${selected.lanes
            .map((lane) => lane.laneId)
            .join('+')}`,
          sourceKey: primaryLane.sourceKey,
          lanes: selected.lanes,
          sourceQuery: {
            mode: 'search',
            query: primaryLane.query,
            ...(parameters === undefined ? {} : { parameters }),
          },
        },
      ],
      skippedLanes: [
        ...selected.notExecutable.map((lane) => ({
          lane,
          reason: 'x-twitter lane is not executable as a search query',
        })),
        ...selected.capped.map((lane) => ({
          lane,
          reason: 'x-twitter search query cap exceeded',
        })),
      ],
    };
  }
}

type XTwitterSelectedSearchLanes = {
  readonly lanes: readonly SocialSearchLane[];
  readonly searchQueries: readonly string[];
  readonly capped: readonly SocialSearchLane[];
  readonly notExecutable: readonly SocialSearchLane[];
};

const xTwitterSearchParameters = (
  selected: XTwitterSelectedSearchLanes,
): SourceRuntimeConfig | undefined =>
  emptyJsonObjectAsUndefined(
    normalizeJsonObject({
      maxItems: totalMaxItems(selected.lanes),
      maxSearchQueries: selected.searchQueries.length,
      searchQueries: selected.searchQueries,
    }),
  );

const X_TWITTER_MAX_SEARCH_QUERIES = 16;

const xTwitterExecutableOperations: ReadonlySet<SocialSearchLane['operation']> =
  new Set(['search', 'account_feed', 'mention_search']);

const selectXTwitterSearchLanes = (
  lanes: readonly SocialSearchLane[],
): XTwitterSelectedSearchLanes => {
  const selectedLanes: SocialSearchLane[] = [];
  const searchQueries: string[] = [];
  const capped: SocialSearchLane[] = [];
  const notExecutable: SocialSearchLane[] = [];

  for (const lane of lanes) {
    if (!xTwitterExecutableOperations.has(lane.operation)) {
      notExecutable.push(lane);
      continue;
    }

    const query = lane.query.trim();
    if (query.length === 0) {
      notExecutable.push(lane);
      continue;
    }

    if (searchQueries.includes(query)) {
      selectedLanes.push(lane);
      continue;
    }

    if (searchQueries.length >= X_TWITTER_MAX_SEARCH_QUERIES) {
      capped.push(lane);
      continue;
    }

    searchQueries.push(query);
    selectedLanes.push(lane);
  }

  return {
    lanes: selectedLanes,
    searchQueries,
    capped,
    notExecutable,
  };
};
