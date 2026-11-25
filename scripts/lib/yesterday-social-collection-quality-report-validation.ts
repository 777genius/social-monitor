import { noRawSecretFragments } from "./yesterday-social-collection-quality-helpers";

export function isValidExistingYesterdaySocialCollectionQualityReport(params: {
  readonly report: unknown;
  readonly expectedCollectionDate: string;
  readonly requiredPrimarySources: readonly string[];
  readonly forbiddenSerializedFragments: readonly string[];
}): boolean {
  const report = recordValue(params.report);
  if (report === undefined) {
    return false;
  }
  const primarySourceCoverage = report.primarySourceCoverage;

  return (
    report.schemaVersion === 1 &&
    report.artifactFormat ===
      "yesterday-social-collection-quality-report-v1" &&
    report.collectionDate === params.expectedCollectionDate &&
    report.collectionBlockingPassed === true &&
    Array.isArray(primarySourceCoverage) &&
    params.requiredPrimarySources.every((source) =>
      primarySourceCoverage.includes(source),
    ) &&
    hasCompleteXAccountAttributionContract(report.operationalWarnings) &&
    noRawSecretFragments(report, params.forbiddenSerializedFragments)
  );
}

function hasCompleteXAccountAttributionContract(value: unknown): boolean {
  const operationalWarnings = recordValue(value);
  if (operationalWarnings === undefined) {
    return false;
  }

  const status = operationalWarnings.xAccountAttributionStatus;
  const warningCount = operationalWarnings.xAccountAttributionWarningCount;
  const warnings = operationalWarnings.xAccountAttributionWarnings;

  return (
    (status === "known" || status === "partial" || status === "unknown") &&
    operationalWarnings.xAccountAttributionPolicy === "warning_only" &&
    typeof operationalWarnings.xAccountAttributionGateReason === "string" &&
    operationalWarnings.xAccountAttributionGateReason.trim().length > 0 &&
    typeof warningCount === "number" &&
    Number.isInteger(warningCount) &&
    warningCount >= 0 &&
    Array.isArray(warnings) &&
    warnings.length === warningCount
  );
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
