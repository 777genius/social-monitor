import type {
  SourceContentQualityInput,
  SourceContentQualityReview,
  SourceContentQualityVerdict,
} from "../domain";

export type SourceContentQualityReviewRequest = SourceContentQualityInput & {
  readonly candidateId: string;
  readonly deterministic: SourceContentQualityVerdict;
};

export type SourceContentQualityReviewResult = SourceContentQualityReview & {
  readonly candidateId: string;
};

export interface SourceContentQualityReviewerPort {
  reviewBatch(
    requests: readonly SourceContentQualityReviewRequest[],
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
