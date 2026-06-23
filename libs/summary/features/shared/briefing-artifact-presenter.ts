import type {
  BriefingArtifact,
  BriefingArtifactProps,
  BriefingContextArtifact,
  StoryCluster,
} from '../../domain';
import type { BriefingFreshness } from '../../ports';

export type BriefingCitationView = {
  readonly citationId: string;
  readonly label: string;
  readonly feedItemId: string;
  readonly sourceItemId: string;
  readonly providerKey: string;
  readonly field: 'title' | 'bodyPreview' | 'canonicalUrl';
};

export type BriefingStoryClusterView = Omit<StoryCluster, 'observedAtRange'> & {
  readonly observedAtRange: {
    readonly startedAt: string;
    readonly endedAt: string;
  };
};

export type BriefingContextArtifactView = Omit<BriefingContextArtifact, 'generatedAt'> & {
  readonly generatedAt: string;
};

export type BriefingArtifactView = Omit<
  BriefingArtifactProps,
  'sourceWindow' | 'storyClusters' | 'contextArtifacts'
> & {
  readonly sourceWindow: Omit<BriefingArtifactProps['sourceWindow'], 'startedAt' | 'endedAt'> & {
    readonly startedAt: string;
    readonly endedAt: string;
  };
  readonly storyClusters: readonly BriefingStoryClusterView[];
  readonly contextArtifacts: readonly BriefingContextArtifactView[];
  readonly citations: readonly BriefingCitationView[];
  readonly freshness: BriefingFreshnessView;
};

export type BriefingFreshnessView =
  | {
      readonly status: 'fresh';
      readonly checkedAt: string;
    }
  | {
      readonly status: 'stale';
      readonly checkedAt: string;
      readonly staleMarkedAt: string;
      readonly reason:
        | 'new_evidence_after_window'
        | 'topic_bindings_changed'
        | 'briefing_policy_changed'
        | 'ranking_policy_changed';
      readonly newestFeedItemId?: string;
      readonly newestObservedAt?: string;
    };

export const presentBriefingArtifact = (
  artifact: BriefingArtifact,
  freshness: BriefingFreshness,
): BriefingArtifactView => {
  const snapshot = artifact.toSnapshot();

  return {
    ...snapshot,
    sourceWindow: {
      ...snapshot.sourceWindow,
      startedAt: snapshot.sourceWindow.startedAt.toISOString(),
      endedAt: snapshot.sourceWindow.endedAt.toISOString(),
    },
    storyClusters: snapshot.storyClusters.map((cluster) => ({
      ...cluster,
      observedAtRange: {
        startedAt: cluster.observedAtRange.startedAt.toISOString(),
        endedAt: cluster.observedAtRange.endedAt.toISOString(),
      },
    })),
    contextArtifacts: snapshot.contextArtifacts.map((contextArtifact) => ({
      ...contextArtifact,
      generatedAt: contextArtifact.generatedAt.toISOString(),
    })),
    citations: snapshot.citationMap.map((citation, index) => ({
      citationId: citation.citationId,
      label: `[${index + 1}]`,
      feedItemId: citation.feedItemId,
      sourceItemId: citation.sourceItemId,
      providerKey: citation.providerKey,
      field: citation.field,
    })),
    freshness: presentFreshness(freshness),
  };
};

const presentFreshness = (freshness: BriefingFreshness): BriefingFreshnessView => {
  if (freshness.status === 'fresh') {
    return {
      status: 'fresh',
      checkedAt: freshness.checkedAt.toISOString(),
    };
  }

  return {
    status: 'stale',
    checkedAt: freshness.checkedAt.toISOString(),
    staleMarkedAt: freshness.staleMarkedAt.toISOString(),
    reason: freshness.reason,
    newestFeedItemId: freshness.newestFeedItemId,
    newestObservedAt: freshness.newestObservedAt?.toISOString(),
  };
};
