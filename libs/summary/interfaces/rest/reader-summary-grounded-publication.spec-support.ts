import type { JsonObject } from "@social-monitor/shared-kernel";
import type { SourceContentQualityReviewRequest, SourceContentQualityReviewResult } from "@social-monitor/relevance/ports";
import { bindPromotionAssessment, promotionWireCandidate } from "@social-monitor/relevance/adapters/model/promotion-review-wire";
import { SyntheticPublicationAssessmentReviewer } from "../../test-fixtures/synthetic-publication-assessment.spec-support";

/** Adds explicit synthetic headline judgments to the existing positive scenarios;
 * original quality scores, evidence and selector decisions remain unchanged. */
export class GroundedPublicationAssessmentReviewer extends SyntheticPublicationAssessmentReviewer {
  override async reviewBatch(
    requests: readonly SourceContentQualityReviewRequest[],
  ): Promise<readonly SourceContentQualityReviewResult[]> {
    const results = await super.reviewBatch(requests);
    return results.map((result) => {
      const request = requests.find((entry) => entry.candidateId === result.candidateId)!;
      return { ...result, assessment: bindPromotionAssessment({
        bindingId: promotionWireCandidate(request).bindingId,
        evidence: result.assessment!.evidence,
        resolvedSoftFlags: result.assessment!.resolvedSoftFlags,
        readerHeadline: {
          status: "available", kind: "claim", text: request.title,
          confidence: 0.95,
          support: [{ field: "title", start: 0, end: request.title.length, quote: request.title }],
          qualifications: [], wholeInput: { titleLength: request.title.length,
            bodyLength: (request.bodyPreview ?? "").length, qualificationJudgment: "none" },
        },
      } as JsonObject, request) };
    });
  }
}
