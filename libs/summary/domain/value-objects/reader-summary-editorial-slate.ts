export const READER_SUMMARY_EDITORIAL_SLATE_VERSION =
  "reader_promotion_policy.v2" as const;

export type ReaderSummaryEditorialPlacement = "top" | "additional";

export type ReaderSummaryEditorialScoreComponents = {
  readonly engagementSalience: number;
  readonly relevance: number;
  readonly evidenceQuality: number;
  readonly integrity: number;
  readonly freshness: number;
  readonly weightedEngagement: number;
  readonly weightedRelevance: number;
  readonly weightedEvidenceQuality: number;
  readonly weightedIntegrity: number;
  readonly weightedFreshness: number;
  readonly total: number;
};

export type ReaderSummaryEditorialSlateEntry = {
  readonly policyVersion: typeof READER_SUMMARY_EDITORIAL_SLATE_VERSION;
  readonly placement: ReaderSummaryEditorialPlacement;
  /** One-based position within placement. */
  readonly slot: number;
  readonly candidateId: string;
  readonly canonicalIdentity: string;
  readonly provider: "x" | "reddit" | "hacker_news" | "github";
  readonly storyClusterId: string;
  readonly scoreComponents: ReaderSummaryEditorialScoreComponents;
  readonly reasonCodes: readonly string[];
  readonly candidateDigestInput: string;
  /** Canonical field-ordered material for this exact placement and slot. */
  readonly digestInput: string;
};

export type ReaderSummaryEditorialSlateExclusion = {
  readonly candidateId: string;
  readonly canonicalIdentity: string;
  readonly reasonCodes: readonly string[];
};

/**
 * Backend-owned ranking authority. The model may annotate entries with prose
 * and citations, but must never change these arrays or their order.
 */
export type ReaderSummaryEditorialSlate = {
  readonly policyVersion: typeof READER_SUMMARY_EDITORIAL_SLATE_VERSION;
  readonly top: readonly ReaderSummaryEditorialSlateEntry[];
  readonly additional: readonly ReaderSummaryEditorialSlateEntry[];
  readonly excluded: readonly ReaderSummaryEditorialSlateExclusion[];
  readonly orderedCandidateIds: readonly string[];
  readonly orderedCanonicalIdentities: readonly string[];
  readonly digestInputs: readonly string[];
  /** Canonical field-ordered material for the complete ordered slate. */
  readonly digestMaterial: string;
};
