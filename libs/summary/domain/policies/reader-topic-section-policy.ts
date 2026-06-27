import type {
  ReaderTopicSection,
  TopicHighlight,
  TopReadCandidate,
} from "../entities/top-read";
import { topicTitle, uniqueNonEmpty } from "../services/reader-summary-support";

export type ReaderTopicSectionInput = {
  readonly topStories: readonly TopReadCandidate[];
  readonly topicHighlights: readonly TopicHighlight[];
};

export const buildTopicSections = (
  input: ReaderTopicSectionInput,
): readonly ReaderTopicSection[] => {
  if (input.topicHighlights.length > 0) {
    return input.topicHighlights.slice(0, 6).map((highlight) => ({
      topicId: highlight.topicId,
      title: highlight.title,
      insight: highlight.summary,
      items: [],
      citationIds: highlight.citationIds,
    }));
  }

  const sectionsByTopic = new Map<string, ReaderTopicSection>();
  for (const story of input.topStories) {
    for (const topicId of story.topicIds) {
      const current = sectionsByTopic.get(topicId);
      sectionsByTopic.set(topicId, {
        topicId,
        title: topicTitle(topicId),
        insight: current?.insight ?? story.summary,
        items: [],
        citationIds: uniqueNonEmpty([
          ...(current?.citationIds ?? []),
          ...story.citationIds,
        ]),
      });
    }
  }

  return [...sectionsByTopic.values()].slice(0, 6);
};
