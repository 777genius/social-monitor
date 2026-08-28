import {
  isReaderFacingQualityTopRead,
  type ReaderFacingTopReadQualityInput,
} from "@social-monitor/summary/domain";
import { isDefaultReaderSummaryEvidenceProvider } from "@social-monitor/summary/adapters/evidence/reader-summary-evidence-provider-filter";

import type { DashboardFeedItemRow } from "./reader-summary-quality-dashboard-published-window";
import {
  asRecord,
  readMetadataNumber,
} from "./reader-summary-quality-eval-support";

export const isEligiblePrimaryTopReadInput = (
  item: DashboardFeedItemRow,
): boolean => {
  if (!isDefaultReaderSummaryEvidenceProvider(item.providerKey)) {
    return false;
  }
  if (
    !/^https?:\/\//i.test(item.canonicalUrl) ||
    item.title.trim().length < 8
  ) {
    return false;
  }
  const metadata = asRecord(item.providerMetadata);
  const score = readMetadataNumber(metadata, "score");
  const likes =
    readMetadataNumber(metadata, "likes") ??
    readMetadataNumber(asRecord(metadata.publicMetrics), "like_count");
  const comments =
    readMetadataNumber(metadata, "numComments") ??
    readMetadataNumber(metadata, "replies") ??
    readMetadataNumber(asRecord(metadata.publicMetrics), "reply_count");
  const reposts =
    readMetadataNumber(metadata, "retweets") ??
    readMetadataNumber(asRecord(metadata.publicMetrics), "retweet_count");

  if (item.providerKey === "reddit") {
    return (score ?? 0) >= 20 || (comments ?? 0) >= 5;
  }
  if (item.providerKey === "x-twitter") {
    return (likes ?? 0) >= 20 || (comments ?? 0) + (reposts ?? 0) >= 5;
  }

  return true;
};

export const readerFacingPrimaryCandidateCount = (params: {
  readonly providerKey: string;
  readonly selectedPosts: readonly ReaderFacingTopReadQualityInput[];
}): number =>
  params.selectedPosts.filter(
    (post) =>
      post.providerKey === params.providerKey &&
      isReaderFacingQualityTopRead(post),
  ).length;

export const primarySummaryRepresentationEnough = (params: {
  readonly selectedCount: number;
  readonly topReadCount: number;
  readonly readerFacingTopReadCandidateCount: number;
}): boolean => {
  const requiredTopReads = Math.min(
    2,
    params.readerFacingTopReadCandidateCount,
  );

  return (
    params.selectedCount >= 5 && params.topReadCount >= requiredTopReads
  );
};

export const primarySummaryProviderBreadthEnough = (params: {
  readonly primarySources: readonly string[];
  readonly providerCounts: Readonly<Record<string, number>>;
}): boolean =>
  params.primarySources.some(
    (source) => (params.providerCounts[source] ?? 0) >= 1,
  );
