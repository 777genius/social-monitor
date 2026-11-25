import { readerPostsInBrowseOrder } from "../policies/reader-post-browse-order";
import { readerPromotionProviderIsPost } from "../policies/reader-promotion-source-registry";
import { READER_SUMMARY_DAILY_INPUT_LIMIT, READER_SUMMARY_DAILY_INPUT_POLICY,
  type ReaderSummaryDailyGenerationInput, type ReaderSummaryDailyInputBinding,
  type ReaderSummaryDailyInputExclusion } from "../value-objects/reader-summary-daily-generation-input";

export type ReaderSummaryDailyGenerationCandidate = ReaderSummaryDailyInputBinding & {
  readonly publishedAt: string;
  readonly providerFamily: string;
  readonly canonicalIdentity: string;
  readonly safe: boolean;
  readonly contextAvailable: boolean;
};

/** ALL ordinary inputs compete by the browser's Likes comparator, not JEV labels. */
export const selectReaderSummaryDailyGenerationInput = (params: {
  readonly candidates: readonly ReaderSummaryDailyGenerationCandidate[];
  readonly manifestSha256: string;
  readonly periodKey: string;
  readonly cutoffAt: string;
}): ReaderSummaryDailyGenerationInput => {
  const selected: ReaderSummaryDailyInputBinding[] = [];
  const excluded: ReaderSummaryDailyInputExclusion[] = [];
  const sources = new Set<string>(), stories = new Set<string>(), canonical = new Set<string>();
  const ordinary = params.candidates.filter(candidate => readerPromotionProviderIsPost(candidate.providerKey));
  for (const candidate of params.candidates.filter(candidate => !readerPromotionProviderIsPost(candidate.providerKey))) {
    excluded.push({ feedItemId: candidate.feedItemId, reason: "appendix_only" });
  }
  const ordered = readerPostsInBrowseOrder(ordinary.map(candidate => ({ ...candidate,
    id: candidate.feedItemId, engagement: candidate.nativeCount, likeCount: candidate.nativeCount,
    usefulness: null, relevance: null })), "likes", params.cutoffAt);
  for (const candidate of ordered) {
    const reason = !candidate.safe ? "unsafe_source" : !candidate.contextAvailable ? "missing_context"
      : sources.has(candidate.sourceItemId) || stories.has(candidate.storyId) || canonical.has(candidate.canonicalIdentity)
        ? "duplicate_story" : selected.length >= READER_SUMMARY_DAILY_INPUT_LIMIT ? "outside_input_limit" : undefined;
    if (reason !== undefined) { excluded.push({ feedItemId: candidate.feedItemId, reason }); continue; }
    sources.add(candidate.sourceItemId); stories.add(candidate.storyId); canonical.add(candidate.canonicalIdentity);
    selected.push({ feedItemId: candidate.feedItemId, sourceItemId: candidate.sourceItemId,
      interestId: candidate.interestId, publishedAt: candidate.publishedAt, observedAt: candidate.observedAt,
      assessmentId: candidate.assessmentId, sourceSnapshotSha256: candidate.sourceSnapshotSha256,
      inputSha256: candidate.inputSha256, storyId: candidate.storyId, providerKey: candidate.providerKey,
      nativeCount: candidate.nativeCount, engagementObservedAt: candidate.engagementObservedAt });
  }
  return { policyVersion: READER_SUMMARY_DAILY_INPUT_POLICY,
    manifestSha256: params.manifestSha256, periodKey: params.periodKey, cutoffAt: params.cutoffAt,
    candidateCount: params.candidates.length, selected, excluded };
};
