import type { ReaderSummaryEvidenceSelectorPort } from "@social-monitor/summary/ports";
import type { Clock } from "@social-monitor/shared-kernel";
import { SourceContentQualityPolicy } from "@social-monitor/relevance/domain";
import type { SourceContentQualityReviewerPort } from "@social-monitor/relevance/ports";
import { assessedPromotionVerdict } from "@social-monitor/relevance/features/rank-feed-items/promotion-assessment-verdict";
import { PROMOTION_ASSESSMENT_BOUNDS } from "@social-monitor/relevance/features/rank-feed-items/promotion-content-assessment";
import { createSourceContentAssessmentReviewer } from "@social-monitor/relevance/interfaces/rest/source-content-assessment-provider-tokens";
import { resolveRelevanceContentQualityReviewerMode } from "@social-monitor/relevance/interfaces/rest/relevance-provider-tokens";
import type { GuardedRefreshRuntime } from "./reader-summary-new-input-refresh-model";

// This caller only authorizes the existing subscription pool. A direct provider
// override cannot bypass its invocation journal, installation or date authority.
export function createRefreshAssessmentReviewer(input: {
  env: NodeJS.ProcessEnv; clock: Clock; runtime: GuardedRefreshRuntime;
}): SourceContentQualityReviewerPort & { assertComplete(expected: number): void } {
  if (resolveRelevanceContentQualityReviewerMode(input.env, "agent-runtime") !== "agent-runtime") {
    throw new Error("Refresh assessment requires the guarded subscription runtime");
  }
  const reviewer = createSourceContentAssessmentReviewer({ env: input.env,
    summaryModelMode: "agent-runtime", client: input.runtime, clock: input.clock });
  const policy = new SourceContentQualityPolicy();
  const seen = new Set<string>();
  let completed = 0;
  let bytes = 0;
  let deadline: number | undefined;
  const fail = (): never => {
    input.runtime.invalidateAdapter("source_content_assessment");
    throw new Error("Refresh assessment is incomplete; original operation requires reconciliation");
  };
  return {
    promotionTiming: reviewer.promotionTiming,
    assertComplete: (expected) => {
      input.runtime.assertUsable();
      if (completed !== expected) fail();
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
            requests.some((request) => assessedPromotionVerdict(request,
              reviews.find((review) => review.candidateId === request.candidateId), policy)
              .reason.startsWith("promotion_assessment_pending:"))) fail();
        input.runtime.assertUsable();
        completed += requests.length;
        return reviews;
      } catch { return fail(); }
    },
  };
}

// Close the canonical selector's pending-result fallback before generation,
// publication, or a no-signal artifact can consume an incomplete assessment.
export function withRefreshAssessmentCompletion(selector: ReaderSummaryEvidenceSelectorPort,
  assessment: { assertComplete(expected: number): void }, expected: number): ReaderSummaryEvidenceSelectorPort {
  return { select: async (query) => {
    const selection = await selector.select(query);
    assessment.assertComplete(expected);
    return selection;
  } };
}
