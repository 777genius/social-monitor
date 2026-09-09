import type { ReaderSummaryContent } from "./reader-summary-artifact";
import type { TopRead } from "./top-read";
import { immutableDisplayValue } from "../services/reader-post-display-identity";

export const immutableReaderDisplayContent = (
  content: ReaderSummaryContent | undefined,
): ReaderSummaryContent | undefined => content === undefined ? undefined : Object.freeze({
  ...content,
  topReads: Object.freeze(content.topReads.map(immutableCard)),
  ...(content.selectedPosts === undefined ? {} : {
    selectedPosts: Object.freeze(content.selectedPosts.map(immutableCard)),
  }),
  interestSections: Object.freeze(content.interestSections.map((section) => Object.freeze({
    ...section, items: Object.freeze(section.items.map(immutableCard)),
  }))),
});

const immutableCard = <T extends TopRead>(card: T): T => Object.freeze({
  ...card,
  ...(card.displayHeadline === undefined ? {} : {
    displayHeadline: immutableDisplayValue(card.displayHeadline),
  }),
  ...(card.capturedSource === undefined ? {} : {
    capturedSource: immutableDisplayValue(card.capturedSource),
  }),
});
