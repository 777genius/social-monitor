import { createHash } from "node:crypto";
import type { SourceContentQualityReviewRequest, SourceContentQualityReviewResult } from "@social-monitor/relevance/ports";
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
      // Synthetic port output uses the documented reader-headline request digest.
      // Only the exact scope/text scenarios accepted by the base fixture reach here.
      const reviewedInputDigest = createHash("sha256").update(JSON.stringify({
        candidateId: request.candidateId, providerKey: request.providerKey,
        context: request.promotion, title: request.title, body: request.bodyPreview ?? "",
      })).digest("hex");
      return { ...result, assessment: {
        ...result.assessment!,
        headlineInput: Object.freeze({ request, reviewedInputDigest,
          title: request.title, body: request.bodyPreview ?? "" }),
        readerHeadline: {
          status: "available", kind: "claim", text: request.title,
          confidence: 0.95,
          support: [{ field: "title", start: 0, end: request.title.length, quote: request.title }],
          qualifications: [], wholeInput: { titleLength: request.title.length,
            bodyLength: (request.bodyPreview ?? "").length, qualificationJudgment: "none" },
        },
      } };
    });
  }
}
