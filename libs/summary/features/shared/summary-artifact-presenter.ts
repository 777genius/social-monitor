import type { SummaryArtifact, SummaryArtifactProps } from '../../domain';

export type SummaryArtifactView = Omit<SummaryArtifactProps, 'sourceWindow'> & {
  readonly sourceWindow: Omit<SummaryArtifactProps['sourceWindow'], 'startedAt' | 'endedAt'> & {
    readonly startedAt: string;
    readonly endedAt: string;
  };
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
  };
};
