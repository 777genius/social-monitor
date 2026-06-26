import type {
  ReaderTopicSection,
  TopicHighlight,
  TopRead,
  TopReadCandidate,
} from "../entities/top-read";
import {
  hasAnyCitation,
  topicTitle,
  uniqueItems,
  uniqueNonEmpty,
} from "../services/reader-summary-support";

export type ReaderTopicSectionInput = {
  readonly topStories: readonly TopReadCandidate[];
  readonly topicHighlights: readonly TopicHighlight[];
};

export const buildTopicSections = (
  input: ReaderTopicSectionInput,
  topReads: readonly TopRead[],
): readonly ReaderTopicSection[] => {
  const usedItemKeys = new Set<string>();

  if (input.topicHighlights.length > 0) {
    return input.topicHighlights.slice(0, 6).map((highlight) => ({
      topicId: highlight.topicId,
      title: highlight.title,
      insight: highlight.summary,
      items: takeUnseenTopReads(
        topReads.filter((item) =>
          hasAnyCitation(item.citationIds, highlight.citationIds),
        ),
        usedItemKeys,
        3,
      ),
      citationIds: highlight.citationIds,
    }));
  }

  const sectionsByTopic = new Map<string, ReaderTopicSection>();
  for (const story of input.topStories) {
    const matchingItem = topReads.find((item) =>
      hasAnyCitation(item.citationIds, story.citationIds),
    );
    for (const topicId of story.topicIds) {
      const current = sectionsByTopic.get(topicId);
      const item =
        matchingItem === undefined ||
        !claimTopReadForSection(matchingItem, usedItemKeys)
          ? []
          : [matchingItem];
      sectionsByTopic.set(topicId, {
        topicId,
        title: topicTitle(topicId),
        insight: current?.insight ?? story.summary,
        items: uniqueItems([...(current?.items ?? []), ...item]).slice(0, 3),
        citationIds: uniqueNonEmpty([
          ...(current?.citationIds ?? []),
          ...story.citationIds,
        ]),
      });
    }
  }

  return [...sectionsByTopic.values()].slice(0, 6);
};

const takeUnseenTopReads = (
  items: readonly TopRead[],
  usedItemKeys: Set<string>,
  limit: number,
): readonly TopRead[] => {
  const selected: TopRead[] = [];

  for (const item of items) {
    if (!claimTopReadForSection(item, usedItemKeys)) {
      continue;
    }
    selected.push(item);
    if (selected.length >= limit) {
      break;
    }
  }

  return selected;
};

const claimTopReadForSection = (
  item: TopRead,
  usedItemKeys: Set<string>,
): boolean => {
  const key = topReadSectionKey(item);
  if (usedItemKeys.has(key)) {
    return false;
  }
  usedItemKeys.add(key);

  return true;
};

const topReadSectionKey = (item: TopRead): string =>
  item.canonicalUrl?.trim().toLowerCase() ??
  `${item.providerKey}:${item.citationIds.join(",")}:${item.title.trim().toLowerCase()}`;
