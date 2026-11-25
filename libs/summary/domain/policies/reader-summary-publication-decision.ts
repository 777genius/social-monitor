import type { ReaderSummaryGitHubProjectionViolationCode } from "./reader-summary-github-projection-audit";

export type ReaderSummaryPublicationRejectionCode =
  | "no_top_reads"
  | "top_read_missing_citation"
  | "top_read_citation_not_found"
  | "top_read_evidence_not_found"
  | "top_read_ineligible_source"
  | "editorial_quality"
  | "technical_leakage"
  | ReaderSummaryGitHubProjectionViolationCode;

export type ReaderSummaryPublicationShadowSignalCode =
  "low_confidence" | "single_source" | "provider_skew" | "stale_evidence";

export type ReaderSummaryPublicationShadowSignal = {
  readonly code: ReaderSummaryPublicationShadowSignalCode;
  readonly score: number;
  readonly reason: string;
};

export type ReaderSummaryPublicationShadowReport = {
  readonly mode: "shadow";
  readonly policyVersion: "reader_summary_publication_shadow_v1";
  readonly riskScore: number;
  readonly signals: readonly ReaderSummaryPublicationShadowSignal[];
};

export type ReaderSummaryPublicationRejectionFinding = {
  readonly code: ReaderSummaryPublicationRejectionCode;
  readonly reason: string;
  readonly topReadTitle?: string;
  readonly citationId?: string;
  readonly feedItemId?: string;
  readonly sourceItemId?: string;
  readonly providerKey?: string;
  readonly canonicalUrl?: string;
};

export type ReaderSummaryPublicationDecision =
  | {
      readonly status: "published";
      readonly qualityPassed: true;
      readonly canonicalScore: number;
      readonly shadow: ReaderSummaryPublicationShadowReport;
      readonly reasons: readonly string[];
    }
  | {
      readonly status: "rejected";
      readonly qualityPassed: false;
      readonly canonicalScore: number;
      readonly shadow: ReaderSummaryPublicationShadowReport;
      readonly reasonCodes: readonly ReaderSummaryPublicationRejectionCode[];
      readonly reasons: readonly string[];
      readonly findings: readonly ReaderSummaryPublicationRejectionFinding[];
    };

export const withReaderSummaryPublicationRejections = (params: {
  readonly decision: ReaderSummaryPublicationDecision;
  readonly findings: readonly ReaderSummaryPublicationRejectionFinding[];
}): ReaderSummaryPublicationDecision => {
  if (params.findings.length === 0) {
    return params.decision;
  }
  const existingFindings =
    params.decision.status === "rejected" ? params.decision.findings : [];
  const findings = uniqueFindings([...existingFindings, ...params.findings]);

  return {
    status: "rejected",
    qualityPassed: false,
    canonicalScore: params.decision.canonicalScore,
    shadow: params.decision.shadow,
    reasonCodes: unique(findings.map((finding) => finding.code)),
    reasons: unique(findings.map((finding) => finding.reason)),
    findings,
  };
};

const unique = <TValue>(values: readonly TValue[]): readonly TValue[] => [
  ...new Set(values),
];

const uniqueFindings = (
  findings: readonly ReaderSummaryPublicationRejectionFinding[],
): readonly ReaderSummaryPublicationRejectionFinding[] => {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = JSON.stringify(finding);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};
