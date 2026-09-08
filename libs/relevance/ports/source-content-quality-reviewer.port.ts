import type {
  SourceContentQualityInput,
  SourceContentQualityReview,
  SourceContentQualityVerdict,
} from "../domain";

export type SourceContentQualityReviewRequest = SourceContentQualityInput & {
  readonly candidateId: string;
  readonly deterministic: SourceContentQualityVerdict;
  readonly promotion?: PromotionReviewContext;
};

export type SourceContentQualityReviewResult = SourceContentQualityReview & {
  readonly candidateId: string;
  readonly assessment?: PromotionReviewAssessment;
};

export interface SourceContentQualityReviewerPort {
  reviewBatch(
    requests: readonly SourceContentQualityReviewRequest[],
    options?: { readonly signal: AbortSignal },
  ): Promise<readonly SourceContentQualityReviewResult[]>;
}

export const NOOP_SOURCE_CONTENT_QUALITY_REVIEWER: SourceContentQualityReviewerPort = {
  async reviewBatch(): Promise<readonly SourceContentQualityReviewResult[]> {
    return [];
  },
};

export const SOURCE_CONTENT_QUALITY_REVIEWER = Symbol(
  "SOURCE_CONTENT_QUALITY_REVIEWER",
);

// A per-invocation frozen binding. Adapters must authenticate the wire response
// against this exact request before returning its context object as the binding.
export type PromotionReviewContext = Readonly<{
  tenantId: string;
  workspaceId: string;
  interestId: string;
  sourceBindingId: string;
  sourceItemId: string;
  trustedIntent: string;
  availability: "title_only" | "body_present" | "truncated";
}>;
export type PromotionEvidenceReference = Readonly<{
  field: "title" | "bodyPreview";
  start: number;
  end: number;
  quote: string;
}>;
export type PromotionReviewAssessment = Readonly<{
  binding: PromotionReviewContext;
  evidence: readonly PromotionEvidenceReference[];
  resolvedSoftFlags: readonly Readonly<{
    flag: "rumor_only";
    justification: string;
    evidence: readonly PromotionEvidenceReference[];
  }>[];
}>;
