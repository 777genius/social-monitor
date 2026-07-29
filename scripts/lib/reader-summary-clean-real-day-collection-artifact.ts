import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

import type { CleanRealDayCollectionReport } from "./clean-real-day-collection-report";
import {
  explicitGitHubUnavailableIsTransparentPartialDailyInput,
  providerMeetsProductionBlockingPolicy,
} from "./production-collection-quality-policy";
import { noRawSecretFragments } from "./yesterday-social-replay-support";

export const readExactDayCollectionArtifact = (params: {
  readonly path: string;
  readonly collectionDate: string;
}): CleanRealDayCollectionReport | null => {
  if (!existsSync(params.path)) {
    return null;
  }

  let value: unknown;
  try {
    value = JSON.parse(readFileSync(params.path, "utf8")) as unknown;
  } catch {
    throw new Error(
      `${params.path} is unreadable; refusing provider recollection`,
    );
  }
  if (!isCollectionReport(value)) {
    throw new Error(
      `${params.path} is invalid; refusing provider recollection`,
    );
  }
  if (value.run.collectionDate !== params.collectionDate) {
    return null;
  }
  assertExactDayIdentity(value, params.collectionDate);
  return value;
};

export const writeCollectionArtifactAtomically = (params: {
  readonly path: string;
  readonly report: CleanRealDayCollectionReport;
}): void => {
  assertExactDayIdentity(params.report, params.report.run.collectionDate);
  mkdirSync(dirname(params.path), { recursive: true });
  const nextPath = `${params.path}.next`;
  writeFileSync(nextPath, `${JSON.stringify(params.report, null, 2)}\n`);
  renameSync(nextPath, params.path);
};

export const collectionArtifactPassesBlockingValidation = (
  report: CleanRealDayCollectionReport,
): boolean =>
  report.schemaVersion === 1 &&
  report.artifactFormat === "reader-summary-clean-real-day-collection-v1" &&
  report.generatedBy ===
    "npm run run:reader-summary-clean-real-day-collection" &&
  report.model.rawProviderPayloadPersistedInReport === false &&
  report.model.rawPostTextPersistedInReport === false &&
  report.model.rawProviderConfigPersistedInReport === false &&
  report.qualityGates.everyRequestedProviderMeetsBlockingCoveragePolicy ===
    true &&
  report.qualityGates.providerRetriesAreBounded === true &&
  report.scans.every(
    (scan) => scan.attemptCount >= 1 && scan.attemptCount <= 3,
  ) &&
  (report.scans.every(providerMeetsProductionBlockingPolicy) ||
    explicitGitHubUnavailableIsTransparentPartialDailyInput({
      requestedProviderKeys: report.inputs.providerKeys,
      scans: report.scans,
      targetWindowProviderCounts: report.targetWindow.providerCounts,
    })) &&
  report.qualityGates.noRawSecretFragments === true &&
  report.blockingPassed === true &&
  noRawSecretFragments(report);

const assertExactDayIdentity = (
  report: CleanRealDayCollectionReport,
  collectionDate: string,
): void => {
  if (
    report.schemaVersion !== 1 ||
    report.artifactFormat !==
      "reader-summary-clean-real-day-collection-v1" ||
    report.generatedBy !==
      "npm run run:reader-summary-clean-real-day-collection" ||
    report.run.collectionDate !== collectionDate ||
    report.inputs.database !== "local-postgres" ||
    report.inputs.targetPublishedWindow.startInclusive !==
      `${collectionDate}T00:00:00.000Z` ||
    report.inputs.targetPublishedWindow.endExclusive !==
      nextUtcDate(collectionDate)
  ) {
    throw new Error(
      `Collection artifact identity does not match ${collectionDate}`,
    );
  }
};

const isCollectionReport = (
  value: unknown,
): value is CleanRealDayCollectionReport => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const report = value as Partial<CleanRealDayCollectionReport>;
  return (
    typeof report.schemaVersion === "number" &&
    typeof report.artifactFormat === "string" &&
    typeof report.generatedBy === "string" &&
    typeof report.run === "object" &&
    report.run !== null &&
    typeof report.run.collectionDate === "string" &&
    typeof report.inputs === "object" &&
    report.inputs !== null
  );
};

const nextUtcDate = (collectionDate: string): string => {
  const value = new Date(`${collectionDate}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString();
};
