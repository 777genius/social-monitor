import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, join } from "node:path";

import type { CleanRealDayCollectionReport } from "./clean-real-day-collection-report";
import {
  explicitGitHubUnavailableIsTransparentPartialDailyInput,
  providerMeetsProductionBlockingPolicy,
} from "./production-collection-quality-policy";
import { noRawSecretFragments } from "./yesterday-social-replay-support";
import {
  assertReaderSummaryDailyMaintenanceScope,
  isReaderSummaryProductionHistoryScope,
  type ReaderSummaryDailyMaintenanceScope,
} from "./reader-summary-daily-maintenance-scope";

export const readerSummaryDailyCollectionArtifactFileName = (
  collectionDate: string,
): string => {
  assertExactUtcDate(collectionDate);
  return `reader-summary-clean-real-day-collection.${collectionDate}.v1.json`;
};

export const readerSummaryDailyCollectionArtifactPath = (params: {
  readonly directory: string;
  readonly collectionDate: string;
}): string => {
  assertSafeCollectionArtifactDirectory(params.directory);
  return join(
    params.directory,
    readerSummaryDailyCollectionArtifactFileName(params.collectionDate),
  );
};

export const readerSummaryDailyCollectionArtifactTemporaryPath = (
  path: string,
): string => {
  assertSafeCollectionArtifactPath(path);
  return join(
    dirname(path),
    `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`,
  );
};

export const readExactDayCollectionArtifact = (params: {
  readonly path: string;
  readonly collectionDate: string;
  readonly expectedScope?: ReaderSummaryDailyMaintenanceScope;
}): CleanRealDayCollectionReport | null => {
  assertExpectedMaintenanceScope(params.expectedScope);
  assertSafeCollectionArtifactPath(params.path);
  if (
    params.expectedScope !== undefined &&
    basename(params.path) !==
      readerSummaryDailyCollectionArtifactFileName(params.collectionDate)
  ) {
    throw new Error(
      "Collection artifact path is not explicit for its requested date",
    );
  }
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
    if (params.expectedScope !== undefined) {
      throw new Error(
        `${params.path} does not contain evidence for ${params.collectionDate}`,
      );
    }
    return null;
  }
  assertExactDayIdentity(value, params.collectionDate);
  if (
    params.expectedScope !== undefined &&
    (value.inputs.scope?.tenantId !== params.expectedScope.tenantId ||
      value.inputs.scope?.workspaceId !== params.expectedScope.workspaceId)
  ) {
    throw new Error(
      `${params.path} scope does not match the canonical daily maintenance scope`,
    );
  }
  return value;
};

export const writeCollectionArtifactAtomically = (params: {
  readonly path: string;
  readonly report: CleanRealDayCollectionReport;
  readonly expectedScope?: ReaderSummaryDailyMaintenanceScope;
}): void => {
  assertExpectedMaintenanceScope(params.expectedScope);
  assertSafeCollectionArtifactPath(params.path);
  assertExactDayIdentity(params.report, params.report.run.collectionDate);
  if (
    params.expectedScope !== undefined &&
    basename(params.path) !==
      readerSummaryDailyCollectionArtifactFileName(
        params.report.run.collectionDate,
      )
  ) {
    throw new Error(
      "Collection artifact path is not explicit for its report date",
    );
  }
  if (
    params.expectedScope !== undefined &&
    (params.report.inputs.scope?.tenantId !== params.expectedScope.tenantId ||
      params.report.inputs.scope?.workspaceId !==
        params.expectedScope.workspaceId)
  ) {
    throw new Error(
      "Collection artifact scope is not the canonical daily maintenance scope",
    );
  }
  const directory = dirname(params.path);
  mkdirSync(directory, { recursive: true });
  const temporaryPath = readerSummaryDailyCollectionArtifactTemporaryPath(
    params.path,
  );
  let descriptor: number | undefined;
  let temporaryCreated = false;
  try {
    descriptor = openSync(temporaryPath, "wx", 0o600);
    temporaryCreated = true;
    writeFileSync(descriptor, `${JSON.stringify(params.report, null, 2)}\n`);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporaryPath, params.path);
    fsyncDirectoryIfSupported(directory);
  } catch (error) {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        // The write failure is still authoritative; cleanup below is attempted.
      }
    }
    if (temporaryCreated) removeTemporaryArtifact(temporaryPath);
    throw error;
  }
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
    report.artifactFormat !== "reader-summary-clean-real-day-collection-v1" ||
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

const assertExactUtcDate = (value: string): void => {
  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(value) ||
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value
  ) {
    throw new Error("Collection artifact date must be an exact UTC date");
  }
};

const assertSafeCollectionArtifactDirectory = (directory: string): void => {
  if (directory.trim().length === 0 || directory !== directory.trim()) {
    throw new Error(
      "Collection artifact directory is required and must be safe",
    );
  }
  assertNoUnsafePathSegments(directory, "Collection artifact directory");
};

const assertExpectedMaintenanceScope = (
  expectedScope: ReaderSummaryDailyMaintenanceScope | undefined,
): void => {
  if (expectedScope !== undefined) {
    if (!isReaderSummaryProductionHistoryScope(expectedScope)) {
      assertReaderSummaryDailyMaintenanceScope(expectedScope);
    }
  }
};

const assertSafeCollectionArtifactPath = (path: string): void => {
  if (path.trim().length === 0 || path !== path.trim()) {
    throw new Error("Collection artifact path is required and must be safe");
  }
  assertNoUnsafePathSegments(path, "Collection artifact path");
  const fileName = basename(path);
  if (fileName.length === 0 || !fileName.endsWith(".json")) {
    throw new Error("Collection artifact path must name a JSON artifact file");
  }
};

const assertNoUnsafePathSegments = (value: string, label: string): void => {
  if (value.includes("\u0000") || value.split(/[\\/]+/u).includes("..")) {
    throw new Error(`${label} contains an unsafe path segment`);
  }
};

const fsyncDirectoryIfSupported = (directory: string): void => {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(directory, "r");
    fsyncSync(descriptor);
  } catch (error) {
    if (isPortableDirectoryFsyncLimitation(error)) return;
    throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
};

const isPortableDirectoryFsyncLimitation = (error: unknown): boolean => {
  const code = (error as NodeJS.ErrnoException).code;
  return (
    code === "EISDIR" ||
    code === "EINVAL" ||
    code === "ENOTSUP" ||
    code === "EOPNOTSUPP" ||
    code === "EPERM"
  );
};

const removeTemporaryArtifact = (temporaryPath: string): void => {
  try {
    unlinkSync(temporaryPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
};
