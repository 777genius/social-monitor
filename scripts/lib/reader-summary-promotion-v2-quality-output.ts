import { existsSync } from "node:fs";
import { join } from "node:path";

import type { ProductionDayExecutionRequest } from
  "./reader-summary-production-day-reuse-provenance";

export const historicalCleanDayCollectionPath = (
  request: ProductionDayExecutionRequest,
  historicalCollectionPath?: string,
  activePublicationSearch?: Readonly<{
    collectionDate: string;
    productionHistoryDirectory?: string;
    rollingArtifactRoot?: string;
  }>,
): string | undefined => {
  if (request.mode !== "historical-regeneration") {
    return historicalCollectionPath;
  }
  if (request.sourceEvidence.kind === "preserved-production-day-report") {
    return request.sourceEvidence.collectionArtifactPath;
  }
  if (historicalCollectionPath !== undefined) return historicalCollectionPath;
  if (activePublicationSearch === undefined) return undefined;

  const fileName =
    `reader-summary-clean-real-day-collection.${activePublicationSearch.collectionDate}.v1.json`;
  const candidates = [
    activePublicationSearch.productionHistoryDirectory === undefined
      ? undefined
      : join(activePublicationSearch.productionHistoryDirectory, fileName),
    join(
      activePublicationSearch.rollingArtifactRoot ??
        "/var/lib/social-monitor/artifacts/rolling-summary",
      "collections",
      fileName,
    ),
  ].filter((value): value is string => value !== undefined);

  return candidates.find((path) => existsSync(path)) ?? candidates[0];
};

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
