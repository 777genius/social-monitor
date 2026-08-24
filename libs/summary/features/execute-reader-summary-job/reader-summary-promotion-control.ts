import type { ReaderSummaryArtifact } from "../../domain";

export type ReaderSummaryPromotionAggregateMetrics = {
  readonly candidateCount: number;
  readonly topCount: number;
  readonly additionalCount: number;
  readonly admittedEvidenceCount: number;
  readonly omittedEvidenceCount: number;
  readonly lifecycle: "evaluated" | "rejected" | "delivered";
};

export interface ReaderSummaryPromotionMetrics {
  record(metrics: ReaderSummaryPromotionAggregateMetrics): void;
}

export type ReaderSummaryPromotionControl = {
  readonly metrics: ReaderSummaryPromotionMetrics;
};

export const NOOP_READER_SUMMARY_PROMOTION_METRICS:
  ReaderSummaryPromotionMetrics = {
  record(): void {},
};

export const readerSummaryPromotionControl = (
  metrics: ReaderSummaryPromotionMetrics,
): ReaderSummaryPromotionControl => Object.freeze({ metrics });

export const recordReaderSummaryPromotionLifecycle = (params: {
  readonly artifact: ReaderSummaryArtifact;
  readonly control: ReaderSummaryPromotionControl;
  readonly lifecycle: "rejected" | "delivered";
}): void => {
  const snapshot = params.artifact.toSnapshot();
  const attestations = snapshot.promotionAttestations ?? [];
  const admittedPromotionEvidenceIds = new Set(attestations.flatMap((item) => [
    item.candidateId,
    ...item.supportFacts.map((fact) => fact.candidateId),
  ]));
  params.control.metrics.record({
    candidateCount: attestations.length,
    topCount: attestations.filter((item) => item.placement === "top").length,
    additionalCount: attestations.filter(
      (item) => item.placement === "additional",
    ).length,
    admittedEvidenceCount: admittedPromotionEvidenceIds.size,
    omittedEvidenceCount: 0,
    lifecycle: params.lifecycle,
  });
};
