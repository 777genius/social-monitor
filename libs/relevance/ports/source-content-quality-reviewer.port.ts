import type {
  SourceContentQualityInput,
  SourceContentQualityReview,
  SourceContentQualityVerdict,
} from "../domain";
import type { PromotionEvidenceReference } from "../domain/promotion-reader-headline";
export type { PromotionEvidenceReference } from "../domain/promotion-reader-headline";

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
  readonly promotionTiming?: {
    readonly batchTimeoutMs: number;
    readonly totalTimeoutMs: number;
    readonly batchConcurrency?: number;
  };
  reviewBatch(
    requests: readonly SourceContentQualityReviewRequest[],
    options?: { readonly signal: AbortSignal; readonly timeoutMs?: number; readonly deadlineAtMs?: number },
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

// Fixed, whitelisted classification for a `reviewBatch` failure. Adapters
// throw `SourceContentAssessmentStageError` so callers (refresh telemetry,
// journals) can distinguish failure causes by `.stage` alone. Consumers must
// never read `.message`: it can echo schema/shape context, and must never be
// persisted — no exception text, payload, title/body, prompt or credential
// ever belongs in a stage code.
export type SourceContentAssessmentFailureStage =
  | "runtime_status"
  | "parse_schema"
  | "binding"
  | "verdict"
  | "deadline"
  | "aborted"
  | "unknown";

export class SourceContentAssessmentStageError extends Error {
  constructor(readonly stage: SourceContentAssessmentFailureStage, message: string) {
    super(message);
    this.name = "SourceContentAssessmentStageError";
  }
}

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
export type PromotionReviewAssessment = Readonly<{
  binding: PromotionReviewContext;
  // Only adapters authenticate this digest against the frozen request. Missing
  // legacy metadata cannot authorize display text, but retains quality behavior.
  headlineInput?: Readonly<{
    request: SourceContentQualityReviewRequest;
    reviewedInputDigest: string;
    title: string;
    body: string;
  }>;
  readerHeadline?: unknown;
  evidence: readonly PromotionEvidenceReference[];
  resolvedSoftFlags: readonly Readonly<{
    flag: "rumor_only";
    justification: string;
    evidence: readonly PromotionEvidenceReference[];
  }>[];
}>;
