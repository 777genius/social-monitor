import type { SummaryArtifact, SummaryArtifactProps } from '../../domain';

export type SummaryCitationView = {
  readonly citationId: string;
  readonly label: string;
  readonly feedItemId: string;
  readonly sourceItemId: string;
  readonly field: 'title' | 'bodyPreview' | 'canonicalUrl';
};

export type SummaryArtifactView = Omit<SummaryArtifactProps, 'sourceWindow'> & {
  readonly sourceWindow: Omit<SummaryArtifactProps['sourceWindow'], 'startedAt' | 'endedAt'> & {
    readonly startedAt: string;
    readonly endedAt: string;
  };
  readonly citations: readonly SummaryCitationView[];
};

export const presentSummaryArtifact = (artifact: SummaryArtifact): SummaryArtifactView => {
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
      field: citation.field,
    })),
  };
};
