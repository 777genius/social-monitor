import type { SummaryEvidenceSelection } from "@social-monitor/summary/domain";
import type { ReaderSummaryEvidenceSelectorPort } from "@social-monitor/summary/ports";
import type { Clock } from "@social-monitor/shared-kernel";
import { SourceContentQualityPolicy } from "@social-monitor/relevance/domain";
import type { SourceContentQualityReviewerPort, SourceContentQualityReviewRequest } from "@social-monitor/relevance/ports";
import { assessedPromotionVerdict } from "@social-monitor/relevance/features/rank-feed-items/promotion-assessment-verdict";
import { PROMOTION_ASSESSMENT_BOUNDS } from "@social-monitor/relevance/features/rank-feed-items/promotion-content-assessment";
import { createSourceContentAssessmentReviewer } from "@social-monitor/relevance/interfaces/rest/source-content-assessment-provider-tokens";
import { resolveRelevanceContentQualityReviewerMode } from "@social-monitor/relevance/interfaces/rest/relevance-provider-tokens";
import type { GuardedRefreshRuntime } from "./reader-summary-new-input-refresh-model";

type AssessmentCompletion = {
  assertComplete(expected: number, selection?: SummaryEvidenceSelection): void;
};

// This caller only authorizes the existing subscription pool. A direct provider
// override cannot bypass its invocation journal, installation or date authority.
export function createRefreshAssessmentReviewer(input: {
  env: NodeJS.ProcessEnv; clock: Clock; runtime: GuardedRefreshRuntime;
}): SourceContentQualityReviewerPort & AssessmentCompletion {
  if (resolveRelevanceContentQualityReviewerMode(input.env, "agent-runtime") !== "agent-runtime") {
    throw new Error("Refresh assessment requires the guarded subscription runtime");
  }
  const reviewer = createSourceContentAssessmentReviewer({ env: input.env,
    summaryModelMode: "agent-runtime", client: input.runtime, clock: input.clock });
  const policy = new SourceContentQualityPolicy();
  const seen = new Set<string>();
  const eligible = new Map<string, SourceContentQualityReviewRequest>();
  let abstained = 0;
  let completed = 0;
  let bytes = 0;
  let deadline: number | undefined;
  const fail = (): never => {
    input.runtime.invalidateAdapter("source_content_assessment");
    throw new Error("Refresh assessment is incomplete; original operation requires reconciliation");
  };
  return {
    promotionTiming: reviewer.promotionTiming,
    assertComplete: (expected, selection) => {
      input.runtime.assertUsable();
      // The snapshot count is an upper bound, not a mandate to spend on every
      // candidate. Every attempted batch must still have a verified outcome.
      if (!Number.isSafeInteger(expected) || expected < completed || completed !== seen.size) fail();
      if (selection === undefined) return;
      // An empty bounded/uncertain result cannot support exhaustive no-signal.
      if (selection.selectedEvidence.length === 0 && (completed < expected || abstained > 0)) {
        throw new Error("Refresh assessment remains pending; cannot publish exhaustive no-signal");
      }
      for (const item of selection.selectedEvidence) {
        if (!item.contentQuality?.eligibleForSummary || item.contentQuality.needsLlmReview) fail();
        // GitHub and supplemental evidence retain their existing canonical gates.
        if (!item.contentQuality?.reason.startsWith("promotion_assessment:")) continue;
        const request = eligible.get(item.feedItemId);
        if (!request || request.providerKey !== item.providerKey || request.title !== item.title.slice(0, 2_000) ||
            request.bodyPreview !== (item.bodyPreview ?? "").slice(0, 12_000) ||
            request.promotion?.interestId !== item.interestId ||
            request.promotion?.sourceItemId !== item.sourceItemId ||
            request.promotion?.sourceBindingId !== item.sourceBindingId) fail();
      }
    },
    reviewBatch: async (requests, options) => {
      try {
        input.runtime.assertUsable();
        const now = input.clock.now().getTime();
        deadline ??= now + reviewer.promotionTiming!.totalTimeoutMs;
        const size = Buffer.byteLength(JSON.stringify(requests), "utf8");
        if (now >= deadline || options?.signal.aborted ||
            requests.some((request) => seen.has(request.candidateId)) ||
            seen.size + requests.length > PROMOTION_ASSESSMENT_BOUNDS.candidates ||
            size > PROMOTION_ASSESSMENT_BOUNDS.batchBytes ||
            bytes + size > PROMOTION_ASSESSMENT_BOUNDS.totalBytes) fail();
        requests.forEach((request) => seen.add(request.candidateId));
        bytes += size; // Consumed before awaiting. Nothing refunds an attempt.
        const reviews = await reviewer.reviewBatch(requests, options);
        if (input.clock.now().getTime() >= deadline || options?.signal.aborted ||
            reviews.length !== requests.length || new Set(reviews.map((r) => r.candidateId)).size !== reviews.length ||
            requests.some((request) => !reviews.some((review) => review.candidateId === request.candidateId))) fail();
        for (const request of requests) {
          const verdict = assessedPromotionVerdict(request,
            reviews.find((review) => review.candidateId === request.candidateId), policy);
          if (verdict.reason.startsWith("promotion_assessment_pending:")) {
            // These reasons are emitted only after binding, shape and quote
            // validation. All other pending outcomes remain authority failures.
            if (verdict.reason !== "promotion_assessment_pending:needs_context" &&
                verdict.reason !== "promotion_assessment_pending:low_confidence") fail();
            abstained++;
          } else if (verdict.eligibleForSummary) eligible.set(request.candidateId, request);
        }
        input.runtime.assertUsable();
        completed += requests.length;
        return reviews;
      } catch { return fail(); }
    },
  };
}

// Check attempted assessment integrity and selected bindings before generation.
// Canonical ranking keeps unassessed/abstaining candidates pending and unselected.
export function withRefreshAssessmentCompletion(selector: ReaderSummaryEvidenceSelectorPort,
  assessment: AssessmentCompletion, expected: number): ReaderSummaryEvidenceSelectorPort {
  return { select: async (query) => {
    const selection = await selector.select(query);
    assessment.assertComplete(expected, selection);
    return selection;
  } };
}
