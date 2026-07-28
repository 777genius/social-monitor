import {
  defaultCleanRealDayCollectionProviderKeys,
  type CleanRealDayCollectionProviderKey,
  type CleanRealDayCollectionReport,
} from "./clean-real-day-collection-report";
import {
  evaluateProductionProviderCollectionState,
  type ProductionProviderCollectionState,
} from "./production-collection-quality-policy";

type ProviderTarget = CleanRealDayCollectionReport["targets"][number];
type ProviderScan = CleanRealDayCollectionReport["scans"][number];

export type DailyProviderCatchUpPlan = {
  readonly collectionDate: string;
  readonly requiredProviderKeys: readonly CleanRealDayCollectionProviderKey[];
  readonly providerStates: readonly DailyProviderCatchUpState[];
  readonly completedProviderKeys: readonly CleanRealDayCollectionProviderKey[];
  readonly providerKeysToCollect: readonly CleanRealDayCollectionProviderKey[];
  readonly previousReport: CleanRealDayCollectionReport | null;
};

export type DailyProviderCatchUpState = Omit<
  ProductionProviderCollectionState,
  "state"
> & {
  readonly providerKey: CleanRealDayCollectionProviderKey;
  readonly state:
    | ProductionProviderCollectionState["state"]
    | "missing"
    | "invalid";
};

export const planDailyProviderCatchUp = (params: {
  readonly collectionDate: string;
  readonly evaluatedAt: Date;
  readonly existingReport: CleanRealDayCollectionReport | null;
  readonly requiredProviderKeys?: readonly CleanRealDayCollectionProviderKey[];
}): DailyProviderCatchUpPlan => {
  if (!Number.isFinite(params.evaluatedAt.getTime())) {
    throw new Error("Provider catch-up evaluation time is invalid");
  }
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

  const closedRequestedUtcDay =
    params.evaluatedAt.getTime() >=
    new Date(nextUtcDate(params.collectionDate)).getTime();
  const providerStates = requiredProviderKeys.map((providerKey) =>
    catchUpState({
      providerKey,
      collectionDate: params.collectionDate,
      closedRequestedUtcDay,
      previousReport,
    }),
  );
  const completedProviderKeys = providerStates
    .filter((state) => state.policy === "accepted")
    .map((state) => state.providerKey);
  const completed = new Set(completedProviderKeys);

  return {
    collectionDate: params.collectionDate,
    requiredProviderKeys,
    providerStates,
    completedProviderKeys,
    providerKeysToCollect: requiredProviderKeys.filter(
      (providerKey) => !completed.has(providerKey),
    ),
    previousReport,
  };
};

export const catchUpCanSpendXReadinessBudget = (
  plan: DailyProviderCatchUpPlan,
): boolean =>
  plan.providerKeysToCollect.length === 1 &&
  plan.providerKeysToCollect[0] === "x-twitter";

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

const catchUpState = (params: {
  readonly providerKey: CleanRealDayCollectionProviderKey;
  readonly collectionDate: string;
  readonly closedRequestedUtcDay: boolean;
  readonly previousReport: CleanRealDayCollectionReport | null;
}): DailyProviderCatchUpState => {
  const scans =
    params.previousReport?.scans.filter(
      (scan) => scan.providerKey === params.providerKey,
    ) ?? [];
  const targets =
    params.previousReport?.targets.filter(
      (target) => target.providerKey === params.providerKey,
    ) ?? [];
  if (scans.length !== 1 || targets.length !== 1) {
    return {
      providerKey: params.providerKey,
      state:
        scans.length === 0 && targets.length <= 1 ? "missing" : "invalid",
      evidence: "invalid",
      policy: "blocking",
      reasonCodes: [
        ...(scans.length === 0
          ? ["scan_evidence_missing"]
          : scans.length > 1
            ? ["scan_evidence_invalid"]
            : []),
        ...(targets.length === 0
          ? ["target_evidence_missing"]
          : targets.length > 1
            ? ["target_evidence_invalid"]
            : []),
      ],
      retryDisposition: "immediate",
    };
  }

  return {
    providerKey: params.providerKey,
    ...evaluateProductionProviderCollectionState({
      collectionDate: params.collectionDate,
      closedRequestedUtcDay: params.closedRequestedUtcDay,
      scan: scans[0]!,
      targetWindowItemCount:
        params.previousReport?.targetWindow.providerCounts[
          params.providerKey
        ] ?? 0,
    }),
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
