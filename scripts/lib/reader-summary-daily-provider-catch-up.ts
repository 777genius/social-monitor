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
  readonly providerKeysRequiringCollection: readonly CleanRealDayCollectionProviderKey[];
  readonly providerKeysToCollect: readonly CleanRealDayCollectionProviderKey[];
  readonly collectionPolicy:
    | "current_day"
    | "previous_day"
    | "historical_explicit"
    | "historical_blocked"
    | "future_blocked";
  readonly collectionAllowed: boolean;
  readonly barrierMessage: string | null;
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
  readonly databaseProviderCounts: Readonly<
    Partial<Record<CleanRealDayCollectionProviderKey, number>>
  >;
  readonly allowHistoricalCollection?: boolean;
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
  const collectionPolicy = resolveCollectionPolicy({
    collectionDate: params.collectionDate,
    evaluatedAt: params.evaluatedAt,
    allowHistoricalCollection: params.allowHistoricalCollection === true,
  });
  const providerStates = requiredProviderKeys.map((providerKey) =>
    catchUpState({
      providerKey,
      collectionDate: params.collectionDate,
      closedRequestedUtcDay,
      previousReport,
      databaseFeedItemCount:
        params.databaseProviderCounts[providerKey] ?? 0,
    }),
  );
  const completedProviderKeys = providerStates
    .filter((state) => state.policy === "accepted")
    .map((state) => state.providerKey);
  const completed = new Set(completedProviderKeys);
  const unsafeProviderKeys = providerStates
    .filter((state) => state.state === "invalid")
    .map((state) => state.providerKey);
  const providerKeysRequiringCollection = requiredProviderKeys.filter(
    (providerKey) => !completed.has(providerKey),
  );
  const barrierMessage =
    unsafeProviderKeys.length > 0
      ? `Provider catch-up DB/artifact evidence is unsafe for ${unsafeProviderKeys.join(",")}`
      : !collectionPolicy.collectionAllowed &&
          providerKeysRequiringCollection.length > 0
        ? `Provider catch-up collection is blocked by ${collectionPolicy.collectionPolicy}`
        : null;

  return {
    collectionDate: params.collectionDate,
    requiredProviderKeys,
    providerStates,
    completedProviderKeys,
    providerKeysRequiringCollection,
    providerKeysToCollect:
      barrierMessage === null ? providerKeysRequiringCollection : [],
    ...collectionPolicy,
    barrierMessage,
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
  readonly databaseFeedItemCount: number;
}): DailyProviderCatchUpState => {
  if (
    !Number.isInteger(params.databaseFeedItemCount) ||
    params.databaseFeedItemCount < 0
  ) {
    return invalidState(params.providerKey, "database_provider_count_invalid");
  }
  const scans =
    params.previousReport?.scans.filter(
      (scan) => scan.providerKey === params.providerKey,
    ) ?? [];
  const targets =
    params.previousReport?.targets.filter(
      (target) => target.providerKey === params.providerKey,
    ) ?? [];
  if (scans.length !== 1 || targets.length !== 1) {
    if (
      params.databaseFeedItemCount > 0 &&
      scans.length === 0 &&
      targets.length <= 1
    ) {
      return invalidState(
        params.providerKey,
        "database_rows_without_collection_evidence",
      );
    }
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
  const collectionFeedItemCount =
    params.previousReport?.targetWindow.providerCounts[params.providerKey];
  if (
    !Number.isInteger(collectionFeedItemCount) ||
    collectionFeedItemCount !== params.databaseFeedItemCount
  ) {
    return invalidState(
      params.providerKey,
      "database_collection_count_mismatch",
    );
  }

  return {
    providerKey: params.providerKey,
    ...evaluateProductionProviderCollectionState({
      collectionDate: params.collectionDate,
      closedRequestedUtcDay: params.closedRequestedUtcDay,
      scan: scans[0]!,
      targetWindowItemCount: params.databaseFeedItemCount,
    }),
  };
};

const invalidState = (
  providerKey: CleanRealDayCollectionProviderKey,
  reasonCode: string,
): DailyProviderCatchUpState => ({
  providerKey,
  state: "invalid",
  evidence: "invalid",
  policy: "blocking",
  reasonCodes: [reasonCode],
  retryDisposition: "deferred",
});

const resolveCollectionPolicy = (params: {
  readonly collectionDate: string;
  readonly evaluatedAt: Date;
  readonly allowHistoricalCollection: boolean;
}): Pick<
  DailyProviderCatchUpPlan,
  "collectionPolicy" | "collectionAllowed"
> => {
  const evaluatedDate = params.evaluatedAt.toISOString().slice(0, 10);
  const previousDate = previousUtcDate(evaluatedDate);
  if (params.collectionDate > evaluatedDate) {
    return {
      collectionPolicy: "future_blocked",
      collectionAllowed: false,
    };
  }
  if (params.collectionDate === evaluatedDate) {
    return {
      collectionPolicy: "current_day",
      collectionAllowed: true,
    };
  }
  if (params.collectionDate === previousDate) {
    return {
      collectionPolicy: "previous_day",
      collectionAllowed: true,
    };
  }
  return params.allowHistoricalCollection
    ? {
        collectionPolicy: "historical_explicit",
        collectionAllowed: true,
      }
    : {
        collectionPolicy: "historical_blocked",
        collectionAllowed: false,
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

const previousUtcDate = (collectionDate: string): string => {
  const value = new Date(`${collectionDate}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
};
