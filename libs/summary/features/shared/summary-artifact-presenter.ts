import type { SummaryArtifact, SummaryArtifactProps } from '../../domain';
import type { SummaryFreshness } from '../../ports';

export type SummaryCitationView = {
  readonly citationId: string;
  readonly label: string;
  readonly feedItemId: string;
  readonly sourceItemId: string;
  readonly providerKey: string;
  readonly field: 'title' | 'bodyPreview' | 'canonicalUrl';
  readonly canonicalUrl?: string;
};

export type SummaryArtifactView = Omit<SummaryArtifactProps, 'sourceWindow'> & {
  readonly sourceWindow: Omit<SummaryArtifactProps['sourceWindow'], 'startedAt' | 'endedAt'> & {
    readonly startedAt: string;
    readonly endedAt: string;
  };
  readonly citations: readonly SummaryCitationView[];
  readonly freshness: SummaryFreshnessView;
};

export type SummaryFreshnessView =
  | {
      readonly status: 'fresh';
      readonly checkedAt: string;
    }
  | {
      readonly status: 'stale';
      readonly checkedAt: string;
      readonly staleMarkedAt: string;
      readonly reason: 'new_evidence_after_window';
      readonly newestFeedItemId: string;
      readonly newestObservedAt: string;
    };

export const presentSummaryArtifact = (
  artifact: SummaryArtifact,
  freshness: SummaryFreshness,
): SummaryArtifactView => {
  const snapshot = artifact.toSnapshot();

  return {
    ...snapshot,
    sourceWindow: {
      ...snapshot.sourceWindow,
      startedAt: snapshot.sourceWindow.startedAt.toISOString(),
      endedAt: snapshot.sourceWindow.endedAt.toISOString(),
    },
    citations: snapshot.citationMap.map((citation, index) => ({
      citationId: citation.citationId,
      label: `[${index + 1}]`,
      feedItemId: citation.feedItemId,
      sourceItemId: citation.sourceItemId,
      providerKey: citation.providerKey,
      field: citation.field,
      canonicalUrl: citation.canonicalUrl,
    })),
    freshness: presentFreshness(freshness),
  };
};

const presentFreshness = (freshness: SummaryFreshness): SummaryFreshnessView => {
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
    newestObservedAt: freshness.newestObservedAt.toISOString(),
  };
};
