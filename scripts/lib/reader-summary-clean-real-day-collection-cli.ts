import {
  collectionDateOptionOrDefault,
  nextDate,
  readOption,
} from "./yesterday-social-replay-support";
import {
  defaultCleanRealDayCollectionProviderKeys,
  type CleanRealDayCollectionProviderKey,
} from "./clean-real-day-collection-report";
import {
  readExactDayCollectionArtifact,
  readerSummaryDailyCollectionArtifactPath,
} from "./reader-summary-clean-real-day-collection-artifact";
import {
  assertReaderSummaryDailyMaintenanceDate,
  isAfterReaderSummaryDailyMaintenanceBounds,
  readerSummaryProductionHistoryMaintenanceBounds,
  readerSummaryDailyJul31Aug3MaintenanceBounds,
} from "./reader-summary-daily-maintenance-bounds";
import {
  readerSummaryDailyMaintenanceScope,
  readerSummaryProductionHistoryScope,
  type ReaderSummaryDailyMaintenanceScope,
} from "./reader-summary-daily-maintenance-scope";

export type ReaderSummaryCleanRealDayCollectionCli = Readonly<{
  update: boolean;
  artifactOnly: boolean;
  recalculateExisting: boolean;
  waitForXReadiness: boolean;
  providerCatchUp: boolean;
  allowHistoricalProviderCollection: boolean;
  allowUnprovenExistingRowsForExactFullCollection: boolean;
  collectionPolicyEvaluatedAt: Date;
  targetCollectionDate: string;
  requestedProviderKeys: readonly CleanRealDayCollectionProviderKey[];
  outputPath: string;
  targetPublishedWindow: Readonly<{
    startInclusive: string;
    endExclusive: string;
  }>;
  targetPublishedWindowConfig: Readonly<{
    startInclusive: string;
    endExclusive: string;
    observedAt: string;
  }>;
  maintenanceScope: ReaderSummaryDailyMaintenanceScope | undefined;
  targetDiscoveryScopePredicate: string;
  targetDiscoveryScopeValues: readonly string[];
}>;

export const readReaderSummaryCleanRealDayCollectionCli = (params: {
  readonly collectionPolicyEvaluatedAt: Date;
  readonly targetPublishedWindowObservedAt: Date;
}): ReaderSummaryCleanRealDayCollectionCli => {
  const update = process.argv.includes("--update");
  const artifactOnly = process.argv.includes("--artifact-only");
  const recalculateExisting = process.argv.includes("--recalculate-existing");
  const waitForXReadiness = process.argv.includes("--wait-for-x-readiness");
  const providerCatchUp = process.argv.includes("--provider-catch-up");
  const allowHistoricalProviderCollection = process.argv.includes(
    "--allow-historical-provider-collection",
  );
  const allowUnprovenExistingRowsForExactFullCollection = process.argv.includes(
    "--allow-unproven-existing-window",
  );
  const { collectionDate: targetCollectionDate } =
    collectionDateOptionOrDefault(dateOnly(params.collectionPolicyEvaluatedAt));
  const requestedProviderKeys = readProviderKeys();
  const artifactDirectory = readOption("--artifact-directory");
  const productionHistoryFirstAttempt = process.argv.includes(
    "--production-history-scope",
  );
  const productionHistoryRetry = process.argv.includes(
    "--production-history-retry",
  );
  if (productionHistoryFirstAttempt && productionHistoryRetry) {
    throw new Error(
      "Production history first-attempt and retry modes are exclusive",
    );
  }
  const productionHistory =
    productionHistoryFirstAttempt || productionHistoryRetry;
  const maintenanceScope =
    artifactDirectory === undefined
      ? undefined
      : productionHistory
        ? readerSummaryProductionHistoryScope
        : readerSummaryDailyMaintenanceScope;

  if (providerCatchUp && process.argv.includes("--providers")) {
    throw new Error("--provider-catch-up cannot be combined with --providers");
  }
  if (
    artifactDirectory !== undefined &&
    (!providerCatchUp || (!update && !artifactOnly))
  ) {
    throw new Error(
      "--artifact-directory requires --provider-catch-up and --update unless --artifact-only",
    );
  }
  if (artifactDirectory !== undefined && recalculateExisting) {
    throw new Error(
      "Date-scoped collection artifacts cannot be recalculated without collection",
    );
  }
  if (productionHistory && artifactDirectory === undefined) {
    throw new Error(
      "--production-history-scope requires a date artifact directory",
    );
  }
  if (
    productionHistoryFirstAttempt &&
    (!update ||
      artifactOnly ||
      !providerCatchUp ||
      !allowHistoricalProviderCollection ||
      !allowUnprovenExistingRowsForExactFullCollection)
  ) {
    throw new Error(
      "--production-history-scope requires update, historical provider catch-up, first-attempt authorization, and a date artifact directory",
    );
  }
  if (
    productionHistoryRetry &&
    (!update ||
      artifactOnly ||
      !providerCatchUp ||
      !allowHistoricalProviderCollection ||
      allowUnprovenExistingRowsForExactFullCollection ||
      artifactDirectory === undefined)
  ) {
    throw new Error(
      "--production-history-retry requires update, historical provider catch-up, an existing date artifact, and no first-attempt authorization",
    );
  }
  if (
    productionHistoryRetry &&
    artifactDirectory !== undefined &&
    readExactDayCollectionArtifact({
      path: readerSummaryDailyCollectionArtifactPath({
        directory: artifactDirectory,
        collectionDate: targetCollectionDate,
      }),
      collectionDate: targetCollectionDate,
      expectedScope: readerSummaryProductionHistoryScope,
    }) === null
  ) {
    throw new Error(
      "--production-history-retry requires the exact dated artifact",
    );
  }
  if (
    allowUnprovenExistingRowsForExactFullCollection &&
    (!providerCatchUp ||
      !allowHistoricalProviderCollection ||
      artifactDirectory === undefined)
  ) {
    throw new Error(
      "--allow-unproven-existing-window requires explicit historical provider catch-up and a date artifact directory",
    );
  }
  if (maintenanceScope !== undefined) {
    const maintenanceBounds = productionHistory
      ? readerSummaryProductionHistoryMaintenanceBounds
      : readerSummaryDailyJul31Aug3MaintenanceBounds;
    assertReaderSummaryDailyMaintenanceDate(
      targetCollectionDate,
      maintenanceBounds,
    );
    if (
      isAfterReaderSummaryDailyMaintenanceBounds(
        targetCollectionDate,
        maintenanceBounds,
      )
    ) {
      throw new Error(
        "Date-scoped maintenance collection is outside the daily maintenance upper bound",
      );
    }
  }

  const targetPublishedWindow = {
    startInclusive: `${targetCollectionDate}T00:00:00.000Z`,
    endExclusive: nextDate(targetCollectionDate),
  };
  return {
    update,
    artifactOnly,
    recalculateExisting,
    waitForXReadiness,
    providerCatchUp,
    allowHistoricalProviderCollection,
    allowUnprovenExistingRowsForExactFullCollection,
    collectionPolicyEvaluatedAt: params.collectionPolicyEvaluatedAt,
    targetCollectionDate,
    requestedProviderKeys,
    outputPath:
      artifactDirectory === undefined
        ? "ops/evals/reader-summary-clean-real-day-collection.v1.json"
        : readerSummaryDailyCollectionArtifactPath({
            directory: artifactDirectory,
            collectionDate: targetCollectionDate,
          }),
    targetPublishedWindow,
    targetPublishedWindowConfig: {
      ...targetPublishedWindow,
      observedAt: params.targetPublishedWindowObservedAt.toISOString(),
    },
    maintenanceScope,
    targetDiscoveryScopePredicate:
      maintenanceScope === undefined
        ? ""
        : "\n        and sb.tenant_id = $2::uuid\n        and sb.workspace_id = $3::uuid",
    targetDiscoveryScopeValues:
      maintenanceScope === undefined
        ? []
        : [maintenanceScope.tenantId, maintenanceScope.workspaceId],
  };
};

const readProviderKeys = (): readonly CleanRealDayCollectionProviderKey[] => {
  const option = readOption("--providers");
  if (option === undefined) return defaultCleanRealDayCollectionProviderKeys;

  const providers = option
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (providers.length === 0) {
    throw new Error("--providers must include at least one provider");
  }

  return providers.map((provider) => {
    if (
      provider !== "github-trending-page" &&
      provider !== "hacker-news" &&
      provider !== "reddit" &&
      provider !== "rss" &&
      provider !== "x-twitter"
    ) {
      throw new Error(`Unsupported provider for clean collection: ${provider}`);
    }
    return provider;
  });
};

const dateOnly = (value: Date): string => value.toISOString().slice(0, 10);
