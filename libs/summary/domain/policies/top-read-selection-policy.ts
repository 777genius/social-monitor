import type { ReaderSummaryCitation } from "../entities/citation";
import type { TopReadCandidate } from "../entities/top-read";
import type {
  StoryCluster,
  SummaryEvidenceItem,
} from "../value-objects/summary-evidence-item";
import { selectUniqueTopReadCandidatePool } from "./top-read-candidate-pool-policy";
import {
  prioritizeTopReadCandidates,
  topReadProviderKeyByStoryId,
} from "./top-read-candidate-order-policy";
import {
  normalizeTopReadLimit,
  selectProviderBalancedTopReads,
} from "./top-read-provider-balance-policy";

export { selectUniqueTopReadCandidatePool } from "./top-read-candidate-pool-policy";

export const selectUniqueTopReadCandidates = (
  stories: readonly TopReadCandidate[],
  citationById: ReadonlyMap<string, ReaderSummaryCitation>,
  evidenceByFeedItemId: ReadonlyMap<string, SummaryEvidenceItem>,
  clusterById: ReadonlyMap<string, StoryCluster>,
  limit = 10,
): readonly TopReadCandidate[] => {
  const normalizedLimit = normalizeTopReadLimit(limit);
  const rankedStories = selectUniqueTopReadCandidatePool(
    stories,
    citationById,
    evidenceByFeedItemId,
    clusterById,
    normalizedLimit,
  );
  const selectedStories = selectProviderBalancedTopReads(
    rankedStories,
    normalizedLimit,
    topReadProviderKeyByStoryId(
      rankedStories,
      citationById,
      evidenceByFeedItemId,
      clusterById,
    ),
  );

  return prioritizeTopReadCandidates(
    selectedStories,
    citationById,
    evidenceByFeedItemId,
    clusterById,
  );
};
