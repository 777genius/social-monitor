import { join } from "node:path";

import type { ProductionDayExecutionRequest } from
  "./reader-summary-production-day-reuse-provenance";

export const historicalCleanDayCollectionPath = (
  request: ProductionDayExecutionRequest,
  historicalCollectionPath?: string,
): string | undefined =>
  request.mode === "historical-regeneration" &&
    request.sourceEvidence.kind === "preserved-production-day-report"
    ? request.sourceEvidence.collectionArtifactPath
    : historicalCollectionPath;

export const historicalPromotionQualityOutput = (input: {
  readonly enabled: boolean;
  readonly reportDirectory: string;
  readonly cleanDayCollectionPath?: string;
}) => {
  const path = (fileName: string): string | undefined => input.enabled
    ? join(input.reportDirectory, "quality-artifacts", fileName)
    : undefined;
  const args = (fileName: string): readonly string[] => {
    const output = path(fileName);
    return output === undefined ? [] : ["--output-path", output];
  };
  const cleanDayArgs = [
    ...(input.enabled ? [
      ...args("reader-summary-clean-real-day-e2e-report.v1.json"),
      "--collection-quality-path",
      path("yesterday-social-collection-quality-report.v1.json")!,
      "--quality-dashboard-path",
      path("reader-summary-quality-dashboard.v1.json")!,
      "--artifact-quality-path",
      path("yesterday-reader-summary-artifact-quality.v1.json")!,
    ] : []),
    ...(input.cleanDayCollectionPath === undefined
      ? [] : ["--collection-path", input.cleanDayCollectionPath]),
  ];
  return { args, path, cleanDayArgs } as const;
};
