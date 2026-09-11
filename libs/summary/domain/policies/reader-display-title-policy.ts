import { isUnpolishedReaderTitle } from "./reader-summary-reader-facing-text-policy";

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
