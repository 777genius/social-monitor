import type {
  ReaderSummaryGitHubProjectionAudit,
  ReaderSummaryGitHubProjectionBinding,
  ReaderSummaryGitHubProjectionViolationCode,
} from "./reader-summary-github-projection-audit-types";
import type { ReaderSummaryGitHubProjectionCollectionTelemetry } from "./reader-summary-github-projection-collection-window";

export const buildGitHubProjectionAudit = (params: {
  readonly status: ReaderSummaryGitHubProjectionAudit["status"];
  readonly requestedUtcDay: string;
  readonly pageCount: number;
  readonly scannedItemCount: number;
  readonly eligibleBindingIds: readonly string[];
  readonly observedThrough?: string;
  readonly projectionCheckedAt?: string;
  readonly telemetry?: ReaderSummaryGitHubProjectionCollectionTelemetry;
  readonly bindings?: readonly ReaderSummaryGitHubProjectionBinding[];
  readonly violationCodes?: readonly ReaderSummaryGitHubProjectionViolationCode[];
  readonly reasons?: readonly string[];
}): ReaderSummaryGitHubProjectionAudit => ({
  schemaVersion: "reader_summary.github_projection.v1",
  status: params.status,
  requestedUtcDay: params.requestedUtcDay,
  pageCount: params.pageCount,
  scannedItemCount: params.scannedItemCount,
  eligibleBindingIds: params.eligibleBindingIds,
  ...(params.observedThrough === undefined
    ? {}
    : { observedThrough: params.observedThrough }),
  ...(params.projectionCheckedAt === undefined
    ? {}
    : { projectionCheckedAt: params.projectionCheckedAt }),
  ...(params.telemetry === undefined ? {} : { telemetry: params.telemetry }),
  bindings: params.bindings ?? [],
  violationCodes: params.violationCodes ?? [],
  reasons: params.reasons ?? [],
});

export const uniqueGitHubProjectionValues = <TValue>(values: readonly TValue[]): TValue[] => [
  ...new Set(values),
];

export const uniqueGitHubProjectionFindings = <
  TFinding extends { readonly code: string; readonly reason: string },
>(findings: readonly TFinding[]): readonly TFinding[] => {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.code}\u0000${finding.reason}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};
