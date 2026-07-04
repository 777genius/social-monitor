export const readerSummaryReliabilityPolicyVersion =
  "reader_summary_reliability_shadow_v1";

export const readerSummaryReliabilityRiskKinds = [
  "duplicate_risk",
  "stale_evidence",
  "single_source",
  "weak_source",
  "low_evidence_diversity",
] as const;

export const readerSummaryReliabilityRiskLevels = [
  "low",
  "medium",
  "high",
] as const;

export type ReaderSummaryReliabilityRiskKind =
  (typeof readerSummaryReliabilityRiskKinds)[number];

export type ReaderSummaryReliabilityRiskLevel =
  (typeof readerSummaryReliabilityRiskLevels)[number];

export type ReaderSummaryReliabilityRisk = {
  readonly kind: ReaderSummaryReliabilityRiskKind;
  readonly level: ReaderSummaryReliabilityRiskLevel;
  readonly score: number;
  readonly description: string;
};

export type ReaderSummaryReliabilityReport = {
  readonly mode: "shadow";
  readonly policyVersion: typeof readerSummaryReliabilityPolicyVersion;
  readonly riskLevel: ReaderSummaryReliabilityRiskLevel;
  readonly riskScore: number;
  readonly risks: readonly ReaderSummaryReliabilityRisk[];
};

export const emptyReaderSummaryReliabilityReport = ():
  ReaderSummaryReliabilityReport => ({
  mode: "shadow",
  policyVersion: readerSummaryReliabilityPolicyVersion,
  riskLevel: "low",
  riskScore: 0,
  risks: [],
});
