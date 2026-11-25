import { planSocialSearch } from '@social-monitor/social-research/domain/policies/social-search-planner';
import type {
  SocialAccountRef,
  SocialCommunityRef,
  SocialSourceKey,
} from '@social-monitor/social-research/domain/value-objects/social-search-intent';
import type { SocialSearchLane } from '@social-monitor/social-research/domain/value-objects/social-search-plan';

import type {
  SourceQueryPlan,
  SourceQueryPlanLane,
  SourceQueryPlannerIntent,
} from '../../domain';
import type { SourceQueryPlannerPort } from '../../ports';

export class SocialResearchSourceQueryPlannerAdapter
  implements SourceQueryPlannerPort
{
  async compilePlan(params: {
    readonly intent: SourceQueryPlannerIntent;
  }): Promise<SourceQueryPlan> {
    const result = planSocialSearch(
      {
        topic: params.intent.topic,
        sources: params.intent.sourceKeys as readonly SocialSourceKey[],
        depth: params.intent.includeEnrichment === false ? 'light' : 'balanced',
        entities: {
          products: params.intent.products,
          keywords: params.intent.keywords,
          handles: params.intent.handles?.map(toSocialAccountRef),
          communities: params.intent.communities?.map(toSocialCommunityRef),
        },
      },
      {
        maxLanes: params.intent.maxLanes,
        sourceLimits: params.intent.sourceKeys.map((sourceKey) => ({
          sourceKey: sourceKey as SocialSourceKey,
          maxLanes: params.intent.maxLanesPerSource,
          maxItemsPerLane: params.intent.maxItemsPerLane,
          includeEnrichment: params.intent.includeEnrichment,
        })),
      },
    );

    if (!result.ok) {
      throw new Error(
        result.errors.map((error) => error.message).join('; ') ||
          'Social search planner failed',
      );
    }

    return {
      plannerId: 'experiment:social-research-query-planner',
      intent: params.intent,
      lanes: result.plan.lanes.map(toSourceQueryPlanLane),
      warnings: result.plan.warnings.map((warning) => warning.message),
    };
  }
}

const toSocialAccountRef = (
  account: NonNullable<SourceQueryPlannerIntent['handles']>[number],
): SocialAccountRef => ({
  handle: account.handle,
  sourceKey: account.sourceKey as SocialSourceKey | undefined,
  includePosts: account.includePosts,
  includeMentions: account.includeMentions,
});

const toSocialCommunityRef = (
  community: NonNullable<SourceQueryPlannerIntent['communities']>[number],
): SocialCommunityRef => ({
  name: community.name,
  sourceKey: community.sourceKey as SocialSourceKey | undefined,
  listings: community.listings,
});

const toSourceQueryPlanLane = (
  lane: SocialSearchLane,
): SourceQueryPlanLane => ({
  laneId: lane.laneId,
  sourceKey: lane.sourceKey,
  kind: lane.kind,
  operation: lane.operation,
  query: lane.query,
  priority: lane.priority,
  maxItems: lane.maxItems,
  reason: lane.reason,
  parameters: toSourceQueryPlanLaneParameters(lane.parameters),
});

const toSourceQueryPlanLaneParameters = (
  parameters: SocialSearchLane['parameters'],
): SourceQueryPlanLane['parameters'] => {
  if (parameters === undefined) {
    return undefined;
  }

  const entries = Object.entries(parameters).filter(
    (entry): entry is [
      string,
      NonNullable<SourceQueryPlanLane['parameters']>[string],
    ] => entry[1] !== undefined,
  );

  return entries.length === 0 ? undefined : Object.fromEntries(entries);
};
