import {
  preparationValue,
  type PreparationValue,
  type PromotionSnapshotPreparation,
} from "@social-monitor/relevance/features/rank-feed-items/promotion-snapshot-preparation";
import type {
  SummaryEvidenceItem,
  SummaryEvidenceSelection,
  ApprovedSameStoryRelation,
  StoryRelationCandidate,
} from "../../domain";
import { mapRankedItem } from "./relevance-reader-summary-evidence-support";

export type ReaderSummaryPreparation = {
  /** Execution order, independently of the raw partitions observed before sort. */
  readonly rankingOrder: readonly { readonly feedItemId: string; readonly rank: number }[];
  readonly rankedInventory: readonly SummaryEvidenceItem[];
  readonly periodExcludedIds: readonly string[];
  readonly defaultProviderExcludedIds: readonly string[];
  readonly periodFiltered: readonly SummaryEvidenceItem[];
  readonly defaultProviderFiltered: readonly SummaryEvidenceItem[];
  readonly candidateItems: readonly SummaryEvidenceItem[];
  readonly groupingInput: readonly SummaryEvidenceItem[];
  readonly initialGrouping: SummaryEvidenceSelection;
  readonly authoritativeGrouping: SummaryEvidenceSelection;
  readonly initialUnclusteredIds: readonly string[];
  readonly authoritativeUnclusteredIds: readonly string[];
  readonly relationCandidates: readonly StoryRelationCandidate[];
  readonly verifiedPairs: readonly string[];
  readonly strictTitlePairs: readonly string[];
  readonly approvedRelations: readonly ApprovedSameStoryRelation[];
  readonly graduatedRelations: readonly ApprovedSameStoryRelation[];
  readonly policyItems: readonly SummaryEvidenceItem[];
  readonly prePolicySelection: SummaryEvidenceSelection;
  /** Already admitted by the supplemental policy; never the full inventory. */
  readonly admittedSupplemental: readonly SummaryEvidenceItem[];
};

export type ReaderSummaryPreparationObserver = {
  readonly promotionSnapshot: (preparation: PreparationValue<{
    readonly ranked: PromotionSnapshotPreparation;
    readonly primary: readonly SummaryEvidenceItem[];
    readonly supplemental: readonly SummaryEvidenceItem[];
  }>) => void;
  readonly beforePolicy: (preparation: PreparationValue<ReaderSummaryPreparation>) => void;
};

export const observeReaderPromotionSnapshot = (
  observer: ReaderSummaryPreparationObserver,
  ranked: PreparationValue<PromotionSnapshotPreparation>,
  cutoff: Date,
  scope: Readonly<{ tenantId: string; workspaceId: string }>,
): void => {
  // Called inside the rank observation boundary, before its combined sort.
  observer.promotionSnapshot(preparationValue({
    ranked,
    primary: ranked.primary.map((item) => mapRankedItem(item, cutoff, scope)),
    supplemental: ranked.supplemental.map((item) => mapRankedItem(item, cutoff, scope)),
  }));
};

export const unclusteredPreparationIds = (
  items: readonly SummaryEvidenceItem[],
  selection: SummaryEvidenceSelection,
): readonly string[] => {
  const clustered = new Set(selection.clusters.flatMap((cluster) =>
    [cluster.representativeFeedItemId, ...cluster.duplicateFeedItemIds]));
  return items.filter((item) => !clustered.has(item.feedItemId))
    .map((item) => item.feedItemId);
};

export const observeReaderSummaryPreparation = (
  observer: ReaderSummaryPreparationObserver,
  preparation: ReaderSummaryPreparation,
): void => {
  try {
    observer.beforePolicy(preparationValue(preparation));
  } catch {
    // Capture owns failure accounting. Selection must remain observationally pure.
  }
};

/** Stage-local exclusions: a later union can deliberately reintroduce an item. */
export const excludedPreparationIds = (
  input: readonly SummaryEvidenceItem[],
  output: readonly SummaryEvidenceItem[],
): readonly string[] => {
  const included = new Set(output.map((item) => item.feedItemId));
  return input.filter((item) => !included.has(item.feedItemId))
    .map((item) => item.feedItemId);
};
