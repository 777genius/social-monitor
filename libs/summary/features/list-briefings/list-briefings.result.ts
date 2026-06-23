import type { BriefingArtifactView } from '../shared/briefing-artifact-presenter';

export type ListBriefingsResult = {
  readonly items: readonly BriefingArtifactView[];
  readonly nextCursor?: string;
};
