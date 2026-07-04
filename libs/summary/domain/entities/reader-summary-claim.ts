import type { TopReadConfidence } from "./top-read";

export const readerSummaryClaimRiskKinds = [
  "single_source",
  "low_confidence",
  "unresolved",
] as const;

export type ReaderSummaryClaimRiskKind =
  (typeof readerSummaryClaimRiskKinds)[number];

export type ReaderSummaryClaimEvidence = {
  readonly title: string;
  readonly providerKey: string;
  readonly citationId: string;
  readonly canonicalUrl?: string;
};

export type ReaderSummaryClaimRisk = {
  readonly kind: ReaderSummaryClaimRiskKind;
  readonly description: string;
};

export type ReaderSummaryClaim = {
  readonly claim: string;
  readonly evidence: readonly ReaderSummaryClaimEvidence[];
  readonly confidence: TopReadConfidence;
  readonly risks: readonly ReaderSummaryClaimRisk[];
  readonly citationIds: readonly string[];
};
