import { createHash } from "node:crypto";
import type {
  PromotionReviewContext,
  SourceContentQualityReviewerPort,
  SourceContentQualityReviewRequest,
  SourceContentQualityReviewResult,
} from "@social-monitor/relevance/ports";

export type SyntheticPublicationAssessment = {
  readonly candidateId: string;
  readonly providerKey: string;
  readonly title: string;
  readonly bodyPreview: string;
  readonly scope: PromotionReviewContext;
  readonly evidenceField: "title" | "bodyPreview";
};

// Explicit positive synthetic scenarios only. This is a reviewer-port fixture,
// not a semantic classifier or an assessment of any captured/real post.
// Unlisted candidates and changed scope/text receive no assessment.
export class SyntheticPublicationAssessmentReviewer
implements SourceContentQualityReviewerPort {
  readonly assessedCandidateIds = new Set<string>();

  constructor(private readonly scenarios: readonly SyntheticPublicationAssessment[]) {}

  async reviewBatch(
    requests: readonly SourceContentQualityReviewRequest[],
  ): Promise<readonly SourceContentQualityReviewResult[]> {
    return requests.flatMap((request) => {
      const scenario = this.scenarios.find((entry) =>
        entry.candidateId === request.candidateId &&
        entry.providerKey === request.providerKey &&
        entry.title === request.title && entry.bodyPreview === request.bodyPreview &&
        request.promotion !== undefined &&
        Object.entries(entry.scope).every(([key, value]) =>
          request.promotion![key as keyof PromotionReviewContext] === value));
      if (scenario === undefined) return [];
      const quote = scenario[scenario.evidenceField];
      if (!quote.trim()) return [];
      this.assessedCandidateIds.add(request.candidateId);
      return [{
        candidateId: request.candidateId,
        decision: "promote" as const,
        confidence: 0.95,
        qualityScore: 0.8,
        interestRelevanceScore: 0.95,
        engagementIntegrityScore: 0.95,
        flags: [],
        reason: "Explicit synthetic publication scenario; not model accuracy evidence.",
        assessment: {
          binding: request.promotion!,
          headlineInput: Object.freeze({ request,
            reviewedInputDigest: createHash("sha256").update(JSON.stringify({
              candidateId: request.candidateId, providerKey: request.providerKey,
              context: request.promotion, title: request.title, body: request.bodyPreview ?? "",
            })).digest("hex"),
            title: request.title, body: request.bodyPreview ?? "" }),
          readerHeadline: { status: "available", kind: "claim", text: request.title, confidence: 0.95,
            support: [{ field: "title", start: 0, end: request.title.length, quote: request.title }],
            qualifications: [], wholeInput: { titleLength: request.title.length,
              bodyLength: (request.bodyPreview ?? "").length, qualificationJudgment: "none" } },
          resolvedSoftFlags: [],
          evidence: [{
            field: scenario.evidenceField,
            start: 0,
            end: quote.length,
            quote,
          }],
        },
      }];
    });
  }
}
