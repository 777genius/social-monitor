import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import {
  isConversationalOrTruncatedReaderTitle,
  isUnpolishedReaderTitle,
} from "../policies/reader-summary-reader-facing-text-policy";

export const buildTopReadTitle = (params: {
  readonly storyTitle: string;
  readonly storySummary: string;
  readonly primaryEvidence: SummaryEvidenceItem | undefined;
  readonly evidence: readonly SummaryEvidenceItem[];
}): string => {
  const sourceTitle = nativeSourceTitle(params.primaryEvidence);
  if (sourceTitle !== undefined) {
    return sourceTitle;
  }

  const storyTitle = cleanTopReadTitle(params.storyTitle);
  if (
    isReaderFacingTopReadTitle(storyTitle) &&
    !isConversationalOrTruncatedReaderTitle(params.storyTitle)
  ) {
    return storyTitle;
  }

  const evidenceTitle = params.evidence
    .map((item) => ({
      cleaned: evidenceReaderTitle(item),
      original: item.title,
      normalizedBreaking: isUnverifiedBreakingSourceTitle(item.title),
      normalizedTruncation: hasUsablePreviewTitle(item),
    }))
    .find(
      (item) =>
        isReaderFacingTopReadTitle(item.cleaned) &&
        (item.normalizedBreaking ||
          item.normalizedTruncation ||
          !isConversationalOrTruncatedReaderTitle(item.original)),
    )?.cleaned;
  const summaryTitle = compactReaderTitle(
    cleanTopReadTitle(firstSentenceForTitle(params.storySummary)),
  );

  return (
    evidenceTitle ??
    (isReaderFacingTopReadTitle(summaryTitle) ? summaryTitle : undefined) ??
    readerFacingFallbackTitle(params.evidence[0]?.providerKey)
  );
};

const nativeSourceTitle = (
  evidence: SummaryEvidenceItem | undefined,
): string | undefined => {
  if (
    evidence === undefined ||
    evidence.providerKey === "x-twitter" ||
    isConversationalOrTruncatedReaderTitle(evidence.title)
  ) {
    return undefined;
  }

  const nativeTitle = evidenceReaderTitle(evidence).trim();
  const title =
    nativeTitle.length <= 140 ? nativeTitle : compactReaderTitle(nativeTitle);
  return isReaderFacingTopReadTitle(title) ? title : undefined;
};

export const evidenceReaderTitle = (evidence: SummaryEvidenceItem): string => {
  if (isUnverifiedBreakingSourceTitle(evidence.title)) {
    const sourceTitle = evidence.title
      .trim()
      .replace(/^X post by @[^:]+:\s*/iu, "")
      .replace(/^(?:breaking|just\s+in)\s*:\s*/iu, "")
      .replace(/^[^\p{L}\p{N}]+/u, "")
      .trim();

    return compactReaderTitle(`Unverified report: ${sourceTitle}`);
  }
  if (hasUsablePreviewTitle(evidence)) {
    return cleanPreviewTitle(evidence.bodyPreview ?? "");
  }

  return cleanTopReadTitle(evidence.title);
};

const hasUsablePreviewTitle = (evidence: SummaryEvidenceItem): boolean => {
  const preview = evidence.bodyPreview?.trim() ?? "";

  return (
    /(?:\.{3,}|…)\s*$/u.test(evidence.title.trim()) &&
    preview.length >= 24 &&
    !/(?:\.{3,}|…)\s*$/u.test(preview) &&
    !/^https?:\/\//iu.test(preview) &&
    previewMatchesTruncatedTitle(evidence.title, preview)
  );
};

const previewMatchesTruncatedTitle = (
  title: string,
  preview: string,
): boolean => {
  const titlePrefix = normalizeTitleComparison(title)
    .split(" ")
    .filter((token) => token.length > 0)
    .slice(0, 5)
    .join(" ");

  return (
    titlePrefix.length >= 12 &&
    normalizeTitleComparison(preview).startsWith(titlePrefix)
  );
};

const normalizeTitleComparison = (value: string): string =>
  value
    .trim()
    .replace(/^X post by @[^:]+:\s*/iu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const cleanPreviewTitle = (value: string): string => {
  const withoutUrls = value.replace(/\s+https?:\/\/\S+/giu, "").trim();

  return compactReaderTitle(
    sentenceCaseTitle(firstSentenceForTitle(withoutUrls)).replace(
      /[.!?]+$/u,
      "",
    ),
  );
};

export const isUnverifiedBreakingSourceTitle = (value: string): boolean =>
  /^(?:X post by @[^:]+:\s*)?(?:breaking|just\s+in)\s*:/iu.test(value.trim());

const readerFacingFallbackTitle = (providerKey: string | undefined): string => {
  switch (providerKey) {
    case "hacker-news":
      return "Developer discussion on AI engineering trade-offs";
    case "reddit":
      return "Community discussion on AI product impact";
    case "rss":
      return "AI product and engineering report";
    case "x-twitter":
      return "Current AI product discussion";
    default:
      return "AI product and engineering update";
  }
};

const cleanTopReadTitle = (value: string): string =>
  sentenceCaseTitle(
    value
      .trim()
      .replace(/^X post by @[^:]+:\s*/iu, "")
      .replace(/(?:\.{3,}|…)+$/u, "")
      .trim(),
  );

const sentenceCaseTitle = (value: string): string =>
  value.replace(/^([a-z])(?=[a-z]+\s)/u, (letter) => letter.toUpperCase());

const firstSentenceForTitle = (value: string): string =>
  value.trim().split(/(?<=[.!?])\s+/u)[0] ?? value;

const compactReaderTitle = (value: string): string => {
  const normalized = value.trim().replace(/[.!?]+$/u, "");
  if (normalized.length <= 140) {
    return normalized;
  }

  const candidate = normalized.slice(0, 140);
  const wordBoundary = candidate.lastIndexOf(" ");

  return wordBoundary >= 80 ? candidate.slice(0, wordBoundary) : candidate;
};

export const isReaderFacingTopReadTitle = (value: string): boolean => {
  const lower = value.trim().toLowerCase();

  return (
    lower.length > 0 &&
    !isUnpolishedReaderTitle(value) &&
    lower !== "cited story" &&
    lower !== "selected evidence" &&
    !lower.startsWith("source-reported:") &&
    !isSourceCoverageFramingText(lower)
  );
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
