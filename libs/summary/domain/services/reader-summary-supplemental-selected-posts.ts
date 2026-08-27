import type { ReaderSummaryCitation } from "../entities/citation";
import type { TopRead } from "../entities/top-read";
import { hasFirstPartyOfficialEvidence } from "../policies/reader-summary-source-authority-policy";
import {
  maxGitHubTrendingDisplayRepositories,
  selectGitHubTrendingDisplayRepositories,
} from "../policies/reader-summary-github-trending-policy";
import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import { normalizeSignalScore } from "../value-objects/signal-score";
import { compactUnique } from "../value-objects/summary-text";
import { readerItemConfidence } from "./reader-summary-support";
import { buildMatchedRules } from "./reader-summary-source-lineage";

export const buildReaderSummarySupplementalTrendSelectedPosts = (params: {
  readonly selectedEvidence: readonly SummaryEvidenceItem[];
  readonly citations: readonly ReaderSummaryCitation[];
}): readonly TopRead[] => {
  const repositories = selectGitHubTrendingDisplayRepositories(
    params.selectedEvidence,
  );
  if (repositories.length !== maxGitHubTrendingDisplayRepositories) {
    return [];
  }
  const citationByFeedItemId = new Map(
    params.citations.map(
      (citation) => [citation.feedItemId, citation] as const,
    ),
  );
  return repositories.flatMap((item) => {
    const citation = citationByFeedItemId.get(item.feedItemId);
    return citation === undefined
      ? []
      : [supplementalEvidenceToSelectedPost(item, citation)];
  });
};

const supplementalEvidenceToSelectedPost = (
  item: SummaryEvidenceItem,
  citation: ReaderSummaryCitation,
): TopRead => {
  const signalScore = normalizeSignalScore(item.score);
  const matchedInterestIds = compactUnique([item.interestId]);
  const effectiveInterestIds =
    matchedInterestIds.length > 0 ? matchedInterestIds : ["unknown-interest"];
  const reason =
    item.whyImportant.find((value) => value.trim().length > 0) ?? item.title;

  return {
    title: item.title,
    providerKey: item.providerKey,
    providerName: item.providerName ?? item.providerKey,
    primaryActionKind: item.readerActionKind ?? "watch_repository",
    reason,
    matchedInterestIds: effectiveInterestIds,
    matchedRules: buildMatchedRules(
      [item],
      effectiveInterestIds,
      item.providerKey,
    ),
    signalScore,
    confidence: readerItemConfidence({
      cluster: undefined,
      independentEvidenceCount: 1,
      confirmedProviderCount: 1,
      signalScore,
      firstPartyOfficial: hasFirstPartyOfficialEvidence([item]),
    }),
    confirmedProviderKeys: [item.providerKey],
    providerMetrics: item.providerMetricLabels ?? [],
    whyImportant: [reason],
    whyNow: `Selected from ${item.providerName ?? item.providerKey} evidence for this summary.`,
    publishedAt: item.publishedAt,
    canonicalUrl: item.canonicalUrl,
    previewMedia: item.previewMedia,
    citationIds: [citation.citationId],
  };
};
