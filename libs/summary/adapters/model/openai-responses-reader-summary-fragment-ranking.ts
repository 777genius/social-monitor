import type { SummaryEvidenceItem } from "../../domain";

import { sourceChunks } from "./openai-responses-reader-summary-fragment-chunking";
import { fragmentScore, sourceTerms } from "./openai-responses-reader-summary-fragment-relevance-policy";

const maxRelevantFragments = 3;

export const relevantSourceFragments = (
  source: string,
  item: SummaryEvidenceItem,
): readonly string[] => {
  const terms = sourceTerms(`${item.title} ${item.whyImportant.join(" ")}`);
  const chunks = sourceChunks(source);
  return chunks
    .map((text, index) => ({
      text,
      index,
      score: fragmentScore(text, terms, index),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, maxRelevantFragments)
    .sort((left, right) => left.index - right.index)
    .map((candidate) => candidate.text);
};
