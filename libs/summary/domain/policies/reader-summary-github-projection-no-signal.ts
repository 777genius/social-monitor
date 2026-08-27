import type { ReaderSummaryGitHubProjectionEvaluation } from "./reader-summary-github-projection-audit";

export const ordinaryNoSignalGitHubProjectionEvaluation = (params: {
  readonly requestedUtcDay: string;
  readonly pageCount: number;
}): ReaderSummaryGitHubProjectionEvaluation => {
  const validPageCount =
    Number.isSafeInteger(params.pageCount) && params.pageCount >= 1;
  const findings = validPageCount
    ? []
    : [
        {
          code: "github_projection_unavailable" as const,
          reason:
            "Durable GitHub binding eligibility was not completely read before no-signal publication.",
        },
      ];
  return {
    audit: {
      schemaVersion: "reader_summary.github_projection.v1",
      status: validPageCount ? "not_required" : "rejected",
      requestedUtcDay: params.requestedUtcDay,
      pageCount: params.pageCount,
      scannedItemCount: 0,
      eligibleBindingIds: [],
      bindings: [],
      violationCodes: findings.map((finding) => finding.code),
      reasons: findings.map((finding) => finding.reason),
    },
    findings,
  };
};
