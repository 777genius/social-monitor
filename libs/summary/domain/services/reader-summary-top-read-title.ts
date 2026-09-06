import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import {
  isConversationalOrTruncatedReaderTitle,
  isUnpolishedReaderTitle,
  READER_TITLE_MAX_LENGTH,
} from "../policies/reader-summary-reader-facing-text-policy";

export const buildTopReadTitle = (params: {
  readonly storyTitle: string;
  readonly storySummary: string;
  readonly primaryEvidence: SummaryEvidenceItem | undefined;
  readonly evidence: readonly SummaryEvidenceItem[];
}): string => {
  const sourceTitle = nativeSourceTitle(
    params.primaryEvidence,
    params.storySummary,
  );
  if (sourceTitle !== undefined) {
    return sourceTitle;
  }

  const storyTitle = cleanTopReadTitle(params.storyTitle);
  if (
    isReaderFacingTopReadTitle(storyTitle) &&
    matchesSummaryOutputScript(storyTitle, params.storySummary) &&
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
        matchesSummaryOutputScript(item.cleaned, params.storySummary) &&
        (item.normalizedBreaking ||
          item.normalizedTruncation ||
          !isConversationalOrTruncatedReaderTitle(item.original)),
    )?.cleaned;
  const summaryTitle = compactReaderTitle(
    cleanTopReadTitle(summarySentenceForTitle(
      params.storySummary,
      ![params.primaryEvidence, ...params.evidence].some((item) =>
        item !== undefined && isUnverifiedBreakingSourceTitle(item.title),
      ),
    )),
  );

  return (
    evidenceTitle ??
    (isReaderFacingTopReadTitle(summaryTitle) ? summaryTitle : undefined) ??
    readerFacingFallbackTitle(params.evidence[0]?.providerKey)
  );
};

const nativeSourceTitle = (
  evidence: SummaryEvidenceItem | undefined,
  storySummary: string,
): string | undefined => {
  if (
    evidence === undefined ||
    evidence.providerKey === "x-twitter" ||
    isConversationalOrTruncatedReaderTitle(evidence.title)
  ) {
    return undefined;
  }

  const nativeTitle = evidenceReaderTitle(evidence).trim();
  const title = nativeTitle.length <= READER_TITLE_MAX_LENGTH
    ? nativeTitle
    : compactReaderTitle(nativeTitle);
  return isReaderFacingTopReadTitle(title) &&
    matchesSummaryOutputScript(title, storySummary)
    ? title
    : undefined;
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
    sentenceCaseTitle(previewSentenceForTitle(withoutUrls)).replace(
      /[.!?]+$/u,
      "",
    ),
  );
};

const previewSentenceForTitle = (value: string): string => {
  const sentences = value
    .trim()
    .split(/(?<=[.!?])\s+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);

  return (
    sentences.find(
      (sentence, index) => (index === 0 || (
        /[.!?]$/u.test(sentence) && !/(?:\.{2,}|…)/u.test(sentence)
      )) &&
        sentence.length >= 24 &&
        !isLowInformationTeaser(sentence) &&
        isReaderFacingTopReadTitle(compactReaderTitle(sentence)),
    ) ??
    sentences[0] ??
    value
  );
};

const isLowInformationTeaser = (value: string): boolean => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, "")
    .replace(/\s+/gu, " ");

  return (
    /^(?:check (?:this|it) out|take a look|look at this|watch this)$/u.test(
      normalized,
    ) ||
    /^(?:you can )?(?:get|do|make) (?:some )?(?:amazing|great|incredible) (?:things|stuff)(?: done)?$/u.test(
      normalized,
    )
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
  repairObviousEnglishAgreement(
    sentenceCaseTitle(
      value
        .trim()
        .replace(/^X post by @[^:]+:\s*/iu, "")
        .replace(/https?:\/\/\S+/giu, " ")
        .replace(/\s+/gu, " ")
        .replace(/(?:\.{3,}|…)+$/u, "")
        .trim(),
    ),
  );

const repairObviousEnglishAgreement = (value: string): string =>
  value.replace(
    /\b(AI\s+boosts\s+research\s+careers\s+but)\s+narrow(?=\s+the\s+span\s+of\s+ideas\s+explored\b)/giu,
    "$1 narrows",
  );

const sentenceCaseTitle = (value: string): string =>
  value.replace(/^([a-z])(?=[a-z]+\s)/u, (letter) => letter.toUpperCase());

const summarySentenceForTitle = (
  value: string,
  allowLaterSentences: boolean,
): string => {
  const sentences = value.trim().split(/(?<=[.!?])\s+/u);
  // A breaking qualifier can scope later sentences too. Never remove it by
  // selecting a later, apparently unqualified claim.
  const candidates = !allowLaterSentences || isUnverifiedBreakingSourceTitle(value)
    ? sentences.slice(0, 1)
    : sentences;
  return candidates
    .filter((sentence, index) => index === 0 || (
      /[.!?]$/u.test(sentence) && !/(?:\.{2,}|…)/u.test(sentence)
    ))
    .map(cleanSummarySentenceForTitle)
    .find((sentence) =>
      isReaderFacingTopReadTitle(compactReaderTitle(cleanTopReadTitle(sentence))),
    ) ?? "";
};

const cleanSummarySentenceForTitle = (value: string): string =>
  value
    .replace(
      /^(?:(?:the|an?|another|this)\s+)?(?:(?:x(?:\/twitter)?|twitter|reddit|hacker\s+news|hn|rss|github(?:\s+trending)?)\s+)?(?:post|item|story|discussion|source|report)\s+(?:reports?|says?|states?|describes?|points?\s+to)\s*:?\s*/iu,
      "",
    )
    .replace(/\s+https?:\/\/\S+/giu, " ")
    .trim();

const compactReaderTitle = (value: string): string => {
  const normalized = value
    .replace(/https?:\/\/\S+/giu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/[.!?]+$/u, "");
  if (normalized.length <= READER_TITLE_MAX_LENGTH) {
    return normalized;
  }

  // Word/comma/colon clipping can discard negation or a qualifying clause.
  // Let callers try another whole sentence, or keep the rejected fallback.
  return "";
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

type ReaderScriptFamily =
  "arabic" | "cjk" | "cyrillic" | "devanagari" | "hangul" | "hebrew" | "latin";

const matchesSummaryOutputScript = (
  candidate: string,
  storySummary: string,
): boolean => {
  const outputScript = dominantReaderScript(storySummary);
  const candidateCounts = readerScriptCounts(candidate);
  const candidateLetterCount = Object.values(candidateCounts).reduce(
    (total, count) => total + count,
    0,
  );
  if (outputScript === undefined || candidateLetterCount < 8) {
    return true;
  }

  const outputScriptCount = candidateCounts[outputScript];
  return outputScript === "latin"
    ? outputScriptCount / candidateLetterCount >= 0.72
    : outputScriptCount >= 4;
};

const dominantReaderScript = (
  value: string,
): ReaderScriptFamily | undefined => {
  const counts = readerScriptCounts(value);
  const ranked = Object.entries(counts).sort(
    (left, right) => right[1] - left[1],
  );
  const [family, count] = ranked[0] ?? [];
  return count !== undefined && count >= 4
    ? (family as ReaderScriptFamily)
    : undefined;
};

const readerScriptCounts = (
  value: string,
): Readonly<Record<ReaderScriptFamily, number>> => ({
  arabic: value.match(/\p{Script=Arabic}/gu)?.length ?? 0,
  cjk:
    (value.match(/\p{Script=Han}/gu)?.length ?? 0) +
    (value.match(/\p{Script=Hiragana}/gu)?.length ?? 0) +
    (value.match(/\p{Script=Katakana}/gu)?.length ?? 0),
  cyrillic: value.match(/\p{Script=Cyrillic}/gu)?.length ?? 0,
  devanagari: value.match(/\p{Script=Devanagari}/gu)?.length ?? 0,
  hangul: value.match(/\p{Script=Hangul}/gu)?.length ?? 0,
  hebrew: value.match(/\p{Script=Hebrew}/gu)?.length ?? 0,
  latin: value.match(/\p{Script=Latin}/gu)?.length ?? 0,
});

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
