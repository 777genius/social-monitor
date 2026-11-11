/**
 * Index already-normalized, cited stories for narrative fallbacks.
 * Repeated ids intentionally retain the final story's value, matching Map
 * construction from the original ordered story array.
 */
export const buildReaderSummaryStoryNarrativeIndex = (
  stories: readonly {
    readonly storyClusterId: string;
    readonly title: string;
    readonly summary: string;
    readonly citationIds: readonly string[];
  }[],
): {
  readonly storyTitlesByClusterId: ReadonlyMap<string, string>;
  readonly storySummariesByClusterId: ReadonlyMap<string, string>;
  readonly storySummariesByCitationId: ReadonlyMap<string, string>;
} => {
  const storyTitlesByClusterId = new Map<string, string>();
  const storySummariesByClusterId = new Map<string, string>();
  const storySummariesByCitationId = new Map<string, string>();
  for (const story of stories) {
    storyTitlesByClusterId.set(story.storyClusterId, story.title);
    storySummariesByClusterId.set(story.storyClusterId, story.summary);
    for (const citationId of story.citationIds) {
      storySummariesByCitationId.set(citationId, story.summary);
    }
  }
  return {
    storyTitlesByClusterId,
    storySummariesByClusterId,
    storySummariesByCitationId,
  };
};
