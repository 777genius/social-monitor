import type { JsonObject } from "@social-monitor/shared-kernel";
import { SourceContentQualityPolicy } from "@social-monitor/relevance/domain";
import type { SourceContentQualityReviewRequest } from "@social-monitor/relevance/ports";
import { bindPromotionAssessment, promotionWireCandidate } from "@social-monitor/relevance/adapters/model/promotion-review-wire";

export const headlineRequest = (body = "Orion benchmark was released. Simulation only.", title = "Orion benchmark"):
  SourceContentQualityReviewRequest => Object.freeze({
    candidateId: "synthetic-candidate", providerKey: "reddit", title, bodyPreview: body,
    deterministic: new SourceContentQualityPolicy().evaluate({ providerKey: "reddit", title, bodyPreview: body }),
    promotion: Object.freeze({ tenantId: "synthetic-tenant", workspaceId: "synthetic-workspace",
      interestId: "synthetic-interest", sourceBindingId: "synthetic-binding", sourceItemId: "synthetic-source",
      trustedIntent: "compiler tooling", availability: body ? "body_present" : "title_only" }),
  });

export const reference = (request: SourceContentQualityReviewRequest, quote: string,
  field: "title" | "bodyPreview" = "bodyPreview") => {
  const start = request[field]!.indexOf(quote);
  if (start < 0) throw new Error("Synthetic quote missing");
  return { field, start, end: start + quote.length, quote };
};

export const subjectProposal = (request: SourceContentQualityReviewRequest) => ({
  status: "available", kind: "subject_label", text: "Orion benchmark discussion",
  confidence: 0.95, support: [reference(request, "Orion", "title"), reference(request, "benchmark", "title")],
  qualifications: [], wholeInput: { titleLength: request.title.length,
    bodyLength: (request.bodyPreview ?? "").length, qualificationJudgment: "subject_only" },
});

export const headlineReview = (request: SourceContentQualityReviewRequest, proposal: unknown = subjectProposal(request)) => ({
  candidateId: request.candidateId, decision: "promote" as const, confidence: 0.95,
  qualityScore: 0.8, interestRelevanceScore: 0.95, engagementIntegrityScore: 0.95,
  flags: [], reason: "Synthetic structural test, not semantic model evaluation",
  assessment: bindPromotionAssessment({ bindingId: promotionWireCandidate(request).bindingId,
    evidence: [reference(request, request.title, "title")], resolvedSoftFlags: [],
    ...(proposal === undefined ? {} : { readerHeadline: proposal }),
  } as JsonObject, request),
});
