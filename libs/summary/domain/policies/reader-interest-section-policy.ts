import type {
  ReaderInterestSection,
  InterestHighlight,
  TopReadCandidate,
} from "../entities/top-read";
import { interestTitle, uniqueNonEmpty } from "../services/reader-summary-support";

export type ReaderInterestSectionInput = {
  readonly topStories: readonly TopReadCandidate[];
  readonly interestHighlights: readonly InterestHighlight[];
};

export const buildInterestSections = (
  input: ReaderInterestSectionInput,
): readonly ReaderInterestSection[] => {
  if (input.interestHighlights.length > 0) {
    return input.interestHighlights.slice(0, 6).map((highlight) => ({
      interestId: highlight.interestId,
      title: highlight.title,
      insight: highlight.summary,
      items: [],
      citationIds: highlight.citationIds,
    }));
  }

  const sectionsByInterest = new Map<string, ReaderInterestSection>();
  for (const story of input.topStories) {
    for (const interestId of story.interestIds) {
      const current = sectionsByInterest.get(interestId);
      sectionsByInterest.set(interestId, {
        interestId,
        title: interestTitle(interestId),
        insight: current?.insight ?? story.summary,
        items: [],
        citationIds: uniqueNonEmpty([
          ...(current?.citationIds ?? []),
          ...story.citationIds,
        ]),
      });
    }
  }

  return [...sectionsByInterest.values()].slice(0, 6);
};
