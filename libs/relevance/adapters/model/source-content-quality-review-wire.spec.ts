import { SourceContentQualityPolicy } from "../../domain";
import type { SourceContentQualityReviewRequest } from "../../ports";
import { promotionWireCandidate } from "./promotion-review-wire";
import {
  parseReviews,
  promotionResponseSchema,
  responseSchema,
  sourceContentQualityFlagValues,
} from "./source-content-quality-review-wire";

const request = (): SourceContentQualityReviewRequest => ({
  candidateId: "synthetic-wire", providerKey: "reddit", title: "Measured compiler diagnostics",
  bodyPreview: "Concrete first-party benchmark numbers for the compiler release.",
  deterministic: new SourceContentQualityPolicy().evaluate({ providerKey: "reddit",
    title: "Measured compiler diagnostics", providerMetadata: { query: "compiler diagnostics" } }),
  promotion: Object.freeze({ tenantId: "synthetic-tenant", workspaceId: "synthetic-workspace",
    interestId: "synthetic-interest", sourceBindingId: "synthetic-binding", sourceItemId: "synthetic-source",
    trustedIntent: "compiler diagnostics", availability: "body_present" }),
});

const review = (input: SourceContentQualityReviewRequest, overrides: Record<string, unknown> = {}) => ({
  candidateId: input.candidateId, bindingId: promotionWireCandidate(input).bindingId,
  decision: "promote", confidence: 0.9, qualityScore: 0.7, interestRelevanceScore: 0.9,
  engagementIntegrityScore: 0.9, flags: [], reason: "Synthetic review",
  evidence: [{ field: "title", start: 0, end: input.title.length, quote: input.title }],
  resolvedSoftFlags: [], ...overrides,
});

describe("source content quality review wire contract", () => {
  it("keeps the flags schema enum in lockstep with the parser's allowed flag set", () => {
    expect(responseSchema.properties.reviews.items.properties.flags.items.enum)
      .toEqual(sourceContentQualityFlagValues);
    expect(promotionResponseSchema.properties.reviews.items.properties.flags.items.enum)
      .toEqual(sourceContentQualityFlagValues);
  });

  it("accepts a review carrying only vocabulary flags", () => {
    const input = request();
    const [result] = parseReviews(JSON.stringify({ reviews: [review(input, { flags: ["trusted_author"] })] }),
      [input]);
    expect(result!.flags).toEqual(["trusted_author"]);
  });

  it("still rejects a flag outside the vocabulary through the parser, even though the schema now constrains it", () => {
    const input = request();
    expect(() => parseReviews(JSON.stringify({ reviews: [review(input, { flags: ["not_a_real_flag"] })] }),
      [input])).toThrow("Invalid promotion review result");
  });

  it("rejects an out-of-range score even when every other field is valid", () => {
    const input = request();
    expect(() => parseReviews(JSON.stringify({ reviews: [review(input, { qualityScore: 8 })] }),
      [input])).toThrow("Invalid promotion review result");
  });
});
