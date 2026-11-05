import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import type { ReaderSummaryQualityDashboardReport } from "./reader-summary-quality-dashboard-contract";
import {
  noRawSecretFragments,
  normalizeLineEndings,
} from "./yesterday-social-replay-support";

export const readerSummaryQualityDashboardOutputPath =
  "ops/evals/reader-summary-quality-dashboard.v1.json";

export function serializeReaderSummaryQualityDashboard(
  report: ReaderSummaryQualityDashboardReport,
): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function writeReaderSummaryQualityDashboard(
  serialized: string,
  outputPath = readerSummaryQualityDashboardOutputPath,
): void {
  mkdirSync(dirname(outputPath), {
    recursive: true,
  });
  writeFileSync(outputPath, serialized);
  console.log(`Updated ${outputPath}`);
}

export function assertReaderSummaryQualityDashboardIsCurrent(
  serialized: string,
  outputPath = readerSummaryQualityDashboardOutputPath,
): void {
  if (!existsSync(outputPath)) {
    throw new Error(
      `${outputPath} is missing. Run npm run check:reader-summary-quality-dashboard -- --update`,
    );
  }

  const expected = normalizeLineEndings(
    readFileSync(outputPath, "utf8"),
  );
  if (expected !== serialized) {
    throw new Error(
      `${outputPath} is stale. Run npm run check:reader-summary-quality-dashboard -- --update`,
    );
  }
}

export function validateExistingReaderSummaryQualityDashboard(params: {
  readonly allowDegraded: boolean;
}, outputPath = readerSummaryQualityDashboardOutputPath): void {
  if (!existsSync(outputPath)) {
    throw new Error(
      `${outputPath} is missing and local data source is unavailable.`,
    );
  }

  const report: unknown = JSON.parse(
    readFileSync(outputPath, "utf8"),
  );

  if (!isExistingReaderSummaryQualityDashboardValid(report, params)) {
    throw new Error(
      `${outputPath} failed existing artifact validation`,
    );
  }

  console.log(
    `Reader summary quality dashboard artifact OK (${report.inputs.dayCount} days)`,
  );
}

export function isExistingReaderSummaryQualityDashboardValid(
  report: unknown,
  params: { readonly allowDegraded: boolean },
): report is { readonly inputs: { readonly dayCount: number } } {
  if (
    !isRecord(report) ||
    !isRecord(report.model) ||
    !isRecord(report.inputs) ||
    !isRecord(report.qualityGates)
  ) {
    return false;
  }

  return (
    report.schemaVersion === 1 &&
    report.artifactFormat === "reader-summary-quality-dashboard-v1" &&
    report.generatedBy === "npm run check:reader-summary-quality-dashboard" &&
    report.model.liveNetwork === false &&
    report.model.rawPostTextPersistedInReport === false &&
    report.model.rawUserFeedbackPersistedInReport === false &&
    typeof report.inputs.dayCount === "number" &&
    report.inputs.dayCount > 0 &&
    (report.blockingPassed === true || params.allowDegraded) &&
    report.qualityGates.noRawSecretFragments === true &&
    noRawSecretFragments(report)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
