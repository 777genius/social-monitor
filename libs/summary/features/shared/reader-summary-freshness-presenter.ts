import type { ReaderSummaryArtifactProps } from "../../domain";
import type { ReaderSummaryFreshness } from "../../ports";

export type ReaderSummaryFreshnessView =
  | {
      readonly status: "fresh";
      readonly checkedAt: string;
    }
  | {
      readonly status: "stale";
      readonly checkedAt: string;
      readonly staleMarkedAt: string;
      readonly reason:
        | "new_evidence_after_window"
        | "interest_bindings_changed"
        | "reader_summary_policy_changed"
        | "ranking_policy_changed";
      readonly newestFeedItemId?: string;
      readonly newestObservedAt?: string;
    };

/**
 * A board ranked under an older promotion stamp is outdated, not invalid:
 * the reader sees the day as stale with `ranking_policy_changed` until it is
 * rebuilt, whatever the evidence freshness probe says.
 */
export const presentReaderSummaryFreshness = (
  freshness: ReaderSummaryFreshness,
  promotionBoardState: ReaderSummaryArtifactProps["promotionBoardState"],
): ReaderSummaryFreshnessView => {
  if (promotionBoardState === "rebuild_required") {
    return {
      status: "stale",
      checkedAt: freshness.checkedAt.toISOString(),
      staleMarkedAt: freshness.status === "stale"
        ? freshness.staleMarkedAt.toISOString() : freshness.checkedAt.toISOString(),
      reason: "ranking_policy_changed",
    };
  }
  if (freshness.status === "fresh") {
    return {
      status: "fresh",
      checkedAt: freshness.checkedAt.toISOString(),
    };
  }

  return {
    status: "stale",
    checkedAt: freshness.checkedAt.toISOString(),
    staleMarkedAt: freshness.staleMarkedAt.toISOString(),
    reason: freshness.reason,
    newestFeedItemId: freshness.newestFeedItemId,
    newestObservedAt: freshness.newestObservedAt?.toISOString(),
  };
};
