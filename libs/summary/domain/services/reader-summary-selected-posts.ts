import type { ReaderSummaryCitation } from "../entities/citation";
import { readerItemIdentityKeys } from "../entities/reader-summary-content-identity";
import type { TopRead } from "../entities/top-read";
import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import { normalizeSignalScore } from "../value-objects/signal-score";
import { compactUnique } from "../value-objects/summary-text";
import {
  buildMatchedRules,
  readerItemConfidence,
} from "./reader-summary-support";
import { hasFirstPartyOfficialEvidence } from "../policies/reader-summary-source-authority-policy";

export const buildReaderSummarySelectedPosts = (params: {
  readonly topReads: readonly TopRead[];
  readonly selectedEvidence?: readonly SummaryEvidenceItem[];
  readonly citationById: ReadonlyMap<string, ReaderSummaryCitation>;
}): readonly TopRead[] => {
  const citationByFeedItemId = new Map(
    [...params.citationById.values()].map(
      (citation) => [citation.feedItemId, citation] as const,
    ),
  );
  const posts: TopRead[] = [];
  const seen = new Set<string>();
  const push = (post: TopRead): void => {
    const keys = readerItemIdentityKeys(post, params.citationById);
    if (keys.some((key) => seen.has(key))) {
      return;
    }
    for (const key of keys) {
      seen.add(key);
    }
    posts.push(post);
  };

  for (const read of params.topReads) {
    push(read);
  }
  for (const item of params.selectedEvidence ?? []) {
    const citation = citationByFeedItemId.get(item.feedItemId);
    if (citation === undefined) {
      continue;
    }
    push(evidenceToSelectedPost(item, citation));
  }

  return posts;
};

const evidenceToSelectedPost = (
  item: SummaryEvidenceItem,
  citation: ReaderSummaryCitation,
): TopRead => {
  const signalScore = normalizeSignalScore(item.score);
  const matchedInterestIds = compactUnique([item.interestId]);
  const sourceExcerpt = readerSummarySelectedPostSourceExcerpt(
    item.bodyPreview,
  );
  const whyImportant = compactUnique([sourceExcerpt, item.title])
    .filter(isUserFacingSelectedPostReason)
    .slice(0, 4);

  return {
    title: item.title,
    providerKey: item.providerKey,
    providerName: item.providerName ?? item.providerKey,
    primaryActionKind: item.readerActionKind ?? "read_source",
    reason: whyImportant[0] ?? item.title,
    matchedInterestIds:
      matchedInterestIds.length > 0 ? matchedInterestIds : ["unknown-interest"],
    matchedRules: buildMatchedRules(
      [item],
      matchedInterestIds.length > 0 ? matchedInterestIds : ["unknown-interest"],
      item.providerKey,
    ),
    signalScore,
    confidence: readerItemConfidence({
      cluster: undefined,
      evidenceCount: 1,
      confirmedProviderCount: 1,
      signalScore,
      firstPartyOfficial: hasFirstPartyOfficialEvidence([item]),
    }),
    confirmedProviderKeys: [item.providerKey],
    providerMetrics: item.providerMetricLabels ?? [],
    whyImportant: whyImportant.length > 0 ? whyImportant : [item.title],
    whyNow: `Selected from ${item.providerName ?? item.providerKey} evidence for this summary.`,
    publishedAt: item.publishedAt,
    canonicalUrl: item.canonicalUrl,
    previewMedia: item.previewMedia,
    citationIds: [citation.citationId],
  };
};

export const readerSummarySelectedPostSourceExcerpt = (
  value: string | undefined,
): string | undefined => {
  const normalized = value
    ?.replace(/\[([^\]]+)\]\(\s*https?:\/\/[^)\s]+\s*\)/giu, "$1")
    .replace(/\(\s*https?:\/\/[^)\s]+\s*\)/giu, "")
    .replace(/https?:\/\/\S+/giu, "")
    .replace(/<[^>]+>/gu, " ")
    .replace(/[*_~`]+/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/^X post by @[^:]+:\s*/iu, "")
    .replace(
      /^(?:(?:illustration|image|photo)(?:\s+credit)?\s+by\s+[^.!?]+[.!?]\s*)+/iu,
      "",
    )
    .replace(
      /^(?:(?:source|image source|photo credit):\s*[^.!?]+[.!?]\s*)+/iu,
      "",
    )
    .trim();

  if (
    normalized === undefined ||
    normalized.length < 24 ||
    !/[\p{L}\p{N}]/u.test(normalized)
  ) {
    return undefined;
  }
  if (normalized.length <= 360) {
    return normalized;
  }

  const prefix = normalized.slice(0, 357);
  const lastWordBoundary = prefix.lastIndexOf(" ");
  const excerpt =
    lastWordBoundary >= 240 ? prefix.slice(0, lastWordBoundary) : prefix;
  return `${excerpt.trimEnd()}...`;
};

const isUserFacingSelectedPostReason = (value: string | undefined): boolean => {
  const trimmed = value?.trim() ?? "";
  const lower = trimmed.toLowerCase();

  return (
    trimmed.length > 0 &&
    trimmed.length <= 360 &&
    !lower.startsWith("illustration by ") &&
    !lower.startsWith("source:") &&
    !lower.startsWith("selected to preserve ") &&
    !lower.startsWith("source coverage") &&
    !lower.startsWith("unsafe source instructions were sandboxed") &&
    !lower.includes("provider coverage in the reader summary") &&
    !lower.includes("source: http") &&
    !/https?:\/\/\S+/iu.test(trimmed)
  );
};
