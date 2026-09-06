import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import { isUnpolishedReaderTitle } from
  "../policies/reader-summary-reader-facing-text-policy";
import { readerPostAvailableSourceText } from "./reader-post-promotion-title";

export const buildTopReadTitle = (params: {
  readonly storyTitle: string;
  readonly storySummary: string;
  readonly primaryEvidence: SummaryEvidenceItem | undefined;
  readonly evidence: readonly SummaryEvidenceItem[];
}): string => {
  // The shared/legacy builder must preserve the same lead context as promotion.
  // A generated title or a support item's text cannot replace that context.
  if (params.primaryEvidence !== undefined) {
    return readerPostAvailableSourceText(params.primaryEvidence) ?? "";
  }
  return "";
};

export const evidenceReaderTitle = (evidence: SummaryEvidenceItem): string =>
  readerPostAvailableSourceText(evidence) ?? "";

export const isUnverifiedBreakingSourceTitle = (value: string): boolean =>
  /^(?:X post by @[^:]+:\s*)?(?:breaking|just\s+in)\s*:/iu.test(value.trim());

/** Concise-title suitability only; source presentation has a separate policy. */
export const isReaderFacingTopReadTitle = (value: string): boolean => {
  const lower = value.trim().toLowerCase();
  return lower.length > 0 && !isUnpolishedReaderTitle(value) &&
    lower !== "cited story" && lower !== "selected evidence" &&
    !lower.startsWith("source-reported:") && !isSourceCoverageFramingText(lower);
};

export const isSourceCoverageFramingText = (lower: string): boolean =>
  lower.startsWith("confirmed by ") ||
  lower.startsWith("cross-source") ||
  lower.startsWith("cross-provider") ||
  lower.startsWith("selected to preserve ") ||
  lower.startsWith("source coverage") ||
  lower.startsWith("provider coverage") ||
  lower.includes("cross-source attention") ||
  lower.includes("cross-provider attention") ||
  lower.includes("cross-source support") ||
  lower.includes("cross-provider support") ||
  lower.includes("cross-source coverage") ||
  lower.includes("cross-provider coverage") ||
  lower.includes("cross-source confirmation") ||
  lower.includes("cross-provider confirmation") ||
  /\b(?:both|multi-source|multi-provider)\b.*\b(?:attention|coverage|support|confirmation)\b/iu.test(
    lower,
  ) ||
  /\b(?:hn|hacker news|rss|reddit|x\/twitter|x-twitter|twitter|x)\b.*\band\b.*\b(?:hn|hacker news|rss|reddit|x\/twitter|x-twitter|twitter|x)\b.*\b(?:attention|coverage|support|confirmation)\b/iu.test(
    lower,
  ) ||
  lower.includes("source groups support this story") ||
  lower.includes("monitored source groups support this story");
