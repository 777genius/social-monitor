import {
  defaultCleanRealDayCollectionProviderKeys,
  type CleanRealDayCollectionProviderKey,
  type CleanRealDayCollectionReport,
} from "./clean-real-day-collection-report";
import { providerMeetsProductionBlockingPolicy } from "./production-collection-quality-policy";

type ProviderTarget = CleanRealDayCollectionReport["targets"][number];
type ProviderScan = CleanRealDayCollectionReport["scans"][number];

export type DailyProviderCatchUpPlan = {
  readonly collectionDate: string;
  readonly requiredProviderKeys: readonly CleanRealDayCollectionProviderKey[];
  readonly completedProviderKeys: readonly CleanRealDayCollectionProviderKey[];
  readonly providerKeysToCollect: readonly CleanRealDayCollectionProviderKey[];
  readonly previousReport: CleanRealDayCollectionReport | null;
};

export const planDailyProviderCatchUp = (params: {
  readonly collectionDate: string;
  readonly existingReport: CleanRealDayCollectionReport | null;
  readonly requiredProviderKeys?: readonly CleanRealDayCollectionProviderKey[];
}): DailyProviderCatchUpPlan => {
  const requiredProviderKeys =
    params.requiredProviderKeys ?? defaultCleanRealDayCollectionProviderKeys;
  const previousReport =
    params.existingReport?.run.collectionDate === params.collectionDate
      ? params.existingReport
      : null;
  if (
    previousReport !== null &&
    (previousReport.schemaVersion !== 1 ||
      previousReport.artifactFormat !==
        "reader-summary-clean-real-day-collection-v1" ||
      previousReport.inputs.targetPublishedWindow.startInclusive !==
        `${params.collectionDate}T00:00:00.000Z` ||
      previousReport.inputs.targetPublishedWindow.endExclusive !==
        nextUtcDate(params.collectionDate))
  ) {
    throw new Error(
      `Provider catch-up report for ${params.collectionDate} has an unsupported format or day window`,
    );
  }

  const completedProviderKeys =
    previousReport === null
      ? []
      : requiredProviderKeys.filter((providerKey) => {
          const scans = previousReport.scans.filter(
            (scan) => scan.providerKey === providerKey,
          );
          return (
            scans.length === 1 &&
            (previousReport.targetWindow.providerCounts[providerKey] ?? 0) >
              0 &&
            (providerKey !== "github-trending-page" ||
              scans[0]!.acquisitionMode !== "durable_snapshot_reuse" ||
              scans[0]!.durableSnapshotProof?.requestedUtcDay ===
                params.collectionDate) &&
            providerMeetsProductionBlockingPolicy(scans[0]!)
          );
        });
  const completed = new Set(completedProviderKeys);

  return {
    collectionDate: params.collectionDate,
    requiredProviderKeys,
    completedProviderKeys,
    providerKeysToCollect: requiredProviderKeys.filter(
      (providerKey) => !completed.has(providerKey),
    ),
    previousReport,
  };
};

export const mergeDailyProviderCatchUpEvidence = (params: {
  readonly plan: DailyProviderCatchUpPlan;
  readonly collectedTargets: readonly ProviderTarget[];
  readonly collectedScans: readonly ProviderScan[];
}): {
  readonly targets: readonly ProviderTarget[];
  readonly scans: readonly ProviderScan[];
} => {
  assertExactlyPlannedProviders(
    params.plan.providerKeysToCollect,
    params.collectedTargets.map((target) => target.providerKey),
    "target",
  );
  assertExactlyPlannedProviders(
    params.plan.providerKeysToCollect,
    params.collectedScans.map((scan) => scan.providerKey),
    "scan",
  );
  const previousTargets = params.plan.previousReport?.targets ?? [];
  const previousScans = params.plan.previousReport?.scans ?? [];
  const collectedTargetKeys = new Set(
    params.collectedTargets.map((target) => target.providerKey),
  );
  const collectedScanKeys = new Set(
    params.collectedScans.map((scan) => scan.providerKey),
  );
  const targets = [
    ...previousTargets.filter(
      (target) => !collectedTargetKeys.has(target.providerKey),
    ),
    ...params.collectedTargets,
  ];
  const scans = [
    ...previousScans.filter(
      (scan) => !collectedScanKeys.has(scan.providerKey),
    ),
    ...params.collectedScans,
  ];

  assertEveryRequiredProviderExactlyOnce(
    params.plan.requiredProviderKeys,
    targets.map((target) => target.providerKey),
    "target",
  );
  assertEveryRequiredProviderExactlyOnce(
    params.plan.requiredProviderKeys,
    scans.map((scan) => scan.providerKey),
    "scan",
  );

  return {
    targets: orderByRequiredProviders(
      params.plan.requiredProviderKeys,
      targets,
    ),
    scans: orderByRequiredProviders(params.plan.requiredProviderKeys, scans),
  };
};

const assertExactlyPlannedProviders = (
  planned: readonly CleanRealDayCollectionProviderKey[],
  actual: readonly CleanRealDayCollectionProviderKey[],
  label: string,
): void => {
  if (
    planned.length !== actual.length ||
    planned.some(
      (providerKey) =>
        actual.filter((candidate) => candidate === providerKey).length !== 1,
    )
  ) {
    throw new Error(
      `Provider catch-up ${label} results must exactly match planned providers`,
    );
  }
};

const assertEveryRequiredProviderExactlyOnce = (
  required: readonly CleanRealDayCollectionProviderKey[],
  actual: readonly CleanRealDayCollectionProviderKey[],
  label: string,
): void => {
  if (
    required.some(
      (providerKey) =>
        actual.filter((candidate) => candidate === providerKey).length !== 1,
    )
  ) {
    throw new Error(
      `Provider catch-up requires exactly one ${label} for every required provider`,
    );
  }
};

const orderByRequiredProviders = <
  Value extends { readonly providerKey: CleanRealDayCollectionProviderKey },
>(
  required: readonly CleanRealDayCollectionProviderKey[],
  values: readonly Value[],
): readonly Value[] =>
  required.map(
    (providerKey) =>
      values.find((value) => value.providerKey === providerKey)!,
  );

const nextUtcDate = (collectionDate: string): string => {
  const value = new Date(`${collectionDate}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString();
};
