import {
  defaultCleanRealDayCollectionProviderKeys,
  type CleanRealDayCollectionProviderKey,
  type CleanRealDayCollectionReport,
} from "./clean-real-day-collection-report";
import {
  evaluateYesterdaySocialProviderReadiness,
  type YesterdaySocialCollectionQualityInput,
  type YesterdaySocialProviderReadiness,
  type YesterdaySocialProviderState,
} from "./yesterday-social-collection-quality";

export type ProductionDayProviderReadinessStatus =
  "complete" | "partial" | "unavailable" | "blocked";

export type ProductionDayDatabaseQualityReport =
  YesterdaySocialCollectionQualityInput & {
    readonly schemaVersion: 1;
    readonly artifactFormat: "yesterday-social-collection-quality-report-v1";
    readonly generatedBy: "npm run check:yesterday-social-collection-quality";
    readonly model: {
      readonly liveNetwork: false;
    };
    readonly inputs: {
      readonly postgresFeedWindow: {
        readonly startInclusive: string;
        readonly endExclusive: string;
      };
    };
    readonly qualityGates: Readonly<Record<string, boolean>>;
    readonly collectionBlockingPassed: boolean;
  };

export type ProductionDayProviderDiagnostic = {
  readonly providerKey: CleanRealDayCollectionProviderKey;
  readonly state: YesterdaySocialProviderState["state"];
  readonly evidence: YesterdaySocialProviderState["evidence"];
  readonly databaseFeedItemCount: number;
  readonly collectionFeedItemCount: number;
  readonly minimumFeedItemCount: number;
  readonly reasonCodes: readonly string[];
};

export type ProductionDayProviderReadiness = {
  readonly status: ProductionDayProviderReadinessStatus;
  readonly summaryPolicy: "allowed" | "blocked";
  readonly collectionDate: string;
  readonly diagnosticsOwner: "postgres_feed_items_published_window";
  readonly providers: readonly ProductionDayProviderDiagnostic[];
  readonly readiness: YesterdaySocialProviderReadiness;
  readonly barrierMessage: string | null;
};

const minimumFeedItemCounts = {
  "github-trending-page": 10,
  "hacker-news": 70,
  reddit: 50,
  rss: 25,
  "x-twitter": 20,
} as const satisfies Readonly<
  Record<CleanRealDayCollectionProviderKey, number>
>;

export const resolveProductionDayProviderReadiness = (params: {
  readonly collectionDate: string;
  readonly evaluatedAt: Date;
  readonly qualityReport: ProductionDayDatabaseQualityReport | null;
  readonly collectionReport: CleanRealDayCollectionReport | null;
}): ProductionDayProviderReadiness => {
  const databaseReportVerified = databaseReportMatchesRequestedDay(
    params.qualityReport,
    params.collectionDate,
  );
  const collectionReportVerified = collectionReportMatchesRequestedDay(
    params.collectionReport,
    params.collectionDate,
  );
  const readiness = evaluateYesterdaySocialProviderReadiness({
    expectedCollectionDate: params.collectionDate,
    evaluatedAt: params.evaluatedAt,
    report: databaseReportVerified ? params.qualityReport : null,
    collectionReport: collectionReportVerified ? params.collectionReport : null,
  });
  if (
    !databaseReportVerified ||
    !collectionReportVerified ||
    params.qualityReport === null ||
    params.collectionReport === null
  ) {
    return blockedReadiness(
      readiness,
      "Exact-day provider readiness diagnostics are missing or stale",
    );
  }

  const providers = buildProviderDiagnostics({
    readiness,
    qualityReport: params.qualityReport,
    collectionReport: params.collectionReport,
  });
  if (providers === null) {
    return blockedReadiness(
      readiness,
      "Provider readiness diagnostics do not match exact-day collection evidence",
    );
  }

  const strictStatus = readinessStatus({
    readiness,
    providers,
    collectionReport: params.collectionReport,
  });
  const durableDatabaseFallback = databaseQualityAllowsSummary({
    qualityReport: params.qualityReport,
    collectionReport: params.collectionReport,
    providers,
  });
  const status =
    strictStatus === "complete"
      ? strictStatus
      : durableDatabaseFallback
        ? "partial"
        : strictStatus;
  const summaryPolicy =
    strictStatus === "complete" || durableDatabaseFallback
      ? "allowed"
      : "blocked";
  return {
    status,
    summaryPolicy,
    collectionDate: params.collectionDate,
    diagnosticsOwner: "postgres_feed_items_published_window",
    providers,
    readiness:
      summaryPolicy === "allowed"
        ? summaryEligibleReadiness(readiness, providers, status)
        : readiness,
    barrierMessage:
      summaryPolicy === "blocked"
        ? (readiness.barrierMessage ??
          "Provider evidence is not eligible for a complete summary or terminal outcome")
        : null,
  };
};

const buildProviderDiagnostics = (params: {
  readonly readiness: YesterdaySocialProviderReadiness;
  readonly qualityReport: ProductionDayDatabaseQualityReport;
  readonly collectionReport: CleanRealDayCollectionReport | null;
}): readonly ProductionDayProviderDiagnostic[] | null => {
  if (
    params.collectionReport === null ||
    params.readiness.providerStates.length !==
      defaultCleanRealDayCollectionProviderKeys.length
  ) {
    return null;
  }

  const providers: ProductionDayProviderDiagnostic[] = [];
  for (const providerKey of defaultCleanRealDayCollectionProviderKeys) {
    const states = params.readiness.providerStates.filter(
      (state) => state.providerKey === providerKey,
    );
    const qualityRows = params.qualityReport.providerReports.filter(
      (row) => row.providerKey === providerKey,
    );
    const databaseFeedItemCount =
      qualityRows.length === 0 ? 0 : qualityRows[0]?.feedItemCount;
    const reportedCollectionFeedItemCount =
      params.collectionReport.targetWindow.providerCounts[providerKey];
    const collectionFeedItemCount =
      reportedCollectionFeedItemCount === undefined &&
      databaseFeedItemCount === 0
        ? 0
        : reportedCollectionFeedItemCount;
    if (
      states.length !== 1 ||
      qualityRows.length > 1 ||
      !isNonNegativeInteger(databaseFeedItemCount) ||
      !isNonNegativeInteger(collectionFeedItemCount)
    ) {
      return null;
    }
    const state = states[0]!;
    providers.push({
      providerKey,
      state: state.state,
      evidence: state.evidence,
      databaseFeedItemCount,
      collectionFeedItemCount,
      minimumFeedItemCount: minimumFeedItemCounts[providerKey],
      reasonCodes: state.reasonCodes,
    });
  }
  return providers;
};

const databaseQualityAllowsSummary = (params: {
  readonly qualityReport: ProductionDayDatabaseQualityReport;
  readonly collectionReport: CleanRealDayCollectionReport;
  readonly providers: readonly ProductionDayProviderDiagnostic[];
}): boolean =>
  params.qualityReport.collectionBlockingPassed === true &&
  Object.keys(params.qualityReport.qualityGates).length > 0 &&
  Object.values(params.qualityReport.qualityGates).every(Boolean) &&
  nonProviderCollectionGatesPass(params.collectionReport.qualityGates) &&
  params.providers.length ===
    defaultCleanRealDayCollectionProviderKeys.length &&
  params.providers.every(
    (provider) =>
      provider.databaseFeedItemCount >= provider.minimumFeedItemCount,
  );

const summaryEligibleReadiness = (
  readiness: YesterdaySocialProviderReadiness,
  providers: readonly ProductionDayProviderDiagnostic[],
  status: ProductionDayProviderReadinessStatus,
): YesterdaySocialProviderReadiness => ({
  ...readiness,
  ready: true,
  policy: status === "complete" ? "complete" : "explicit_partial",
  readyProviderKeys: providers.map((provider) => provider.providerKey),
  blockingProviderKeys: [],
  missingProviderKeys: [],
  duplicateProviderKeys: [],
  emptyProviderKeys: [],
  partialProviderKeys: providers
    .filter((provider) => provider.state !== "complete")
    .map((provider) => provider.providerKey),
  unavailableProviderKeys: [],
  retrySchedule: null,
  barrierMessage: null,
});

const readinessStatus = (params: {
  readonly readiness: YesterdaySocialProviderReadiness;
  readonly providers: readonly ProductionDayProviderDiagnostic[];
  readonly collectionReport: CleanRealDayCollectionReport;
}): ProductionDayProviderReadinessStatus => {
  if (!nonProviderCollectionGatesPass(params.collectionReport.qualityGates)) {
    return "blocked";
  }
  if (
    params.readiness.ready &&
    params.readiness.policy === "complete" &&
    params.providers.every(
      (provider) =>
        provider.state === "complete" &&
        provider.databaseFeedItemCount >= provider.minimumFeedItemCount,
    ) &&
    githubHasVerifiedExactDayEvidence(params)
  ) {
    return "complete";
  }

  const statesAreTerminal = params.providers.every((provider) =>
    provider.state === "complete"
      ? completeProviderIsVerified(provider)
      : provider.state === "partial"
        ? partialProviderIsBounded(provider, params.collectionReport)
        : provider.state === "unavailable"
          ? unavailableProviderIsExplicit(provider, params.collectionReport)
          : false,
  );
  if (!statesAreTerminal || !githubIsTerminallyVerified(params)) {
    return "blocked";
  }
  return params.providers.some((provider) => provider.state === "unavailable")
    ? "unavailable"
    : params.providers.some((provider) => provider.state === "partial")
      ? "partial"
      : "blocked";
};

const completeProviderIsVerified = (
  provider: ProductionDayProviderDiagnostic,
): boolean =>
  provider.databaseFeedItemCount >= provider.minimumFeedItemCount &&
  provider.evidence !== "invalid";

const partialProviderIsBounded = (
  provider: ProductionDayProviderDiagnostic,
  collectionReport: CleanRealDayCollectionReport,
): boolean => {
  const scan = onlyProviderScan(collectionReport, provider.providerKey);
  return (
    provider.providerKey !== "github-trending-page" &&
    provider.databaseFeedItemCount >= provider.minimumFeedItemCount &&
    provider.evidence === "live_collection" &&
    provider.reasonCodes.length > 0 &&
    provider.reasonCodes.every((reason) => reason === "target_shortfall") &&
    scan?.status === "succeeded" &&
    scan.acquisitionMode === "live_collection" &&
    scan.observability.coverageState === "partial"
  );
};

const unavailableProviderIsExplicit = (
  provider: ProductionDayProviderDiagnostic,
  collectionReport: CleanRealDayCollectionReport,
): boolean => {
  const scan = onlyProviderScan(collectionReport, provider.providerKey);
  if (
    provider.databaseFeedItemCount !== 0 ||
    provider.evidence !== "explicit_unavailable" ||
    scan === undefined ||
    typeof scan.failureFingerprint !== "string" ||
    scan.failureFingerprint.length === 0
  ) {
    return false;
  }
  if (provider.providerKey === "github-trending-page") {
    return (
      scan.status === "failed" &&
      scan.acquisitionMode === "durable_snapshot_reuse" &&
      scan.durableSnapshotProof === undefined
    );
  }
  return (
    scan.status === "failed" &&
    scan.attemptCount === 3 &&
    scan.acquisitionMode === "live_collection" &&
    scan.observability.acquisitionMode === "live_collection" &&
    scan.observability.coverageState === "unavailable" &&
    scan.observability.collectedItemCount === 0 &&
    scan.observability.acceptedItemCount === 0 &&
    scan.observability.insertedItemCount === 0 &&
    scan.observability.slo.reasons.includes("provider_unavailable")
  );
};

const githubHasVerifiedExactDayEvidence = (params: {
  readonly providers: readonly ProductionDayProviderDiagnostic[];
  readonly collectionReport: CleanRealDayCollectionReport;
}): boolean => {
  const github = params.providers.find(
    (provider) => provider.providerKey === "github-trending-page",
  );
  const scan = onlyProviderScan(
    params.collectionReport,
    "github-trending-page",
  );
  return (
    github?.state === "complete" &&
    github.evidence === "exact_day_durable_snapshot" &&
    scan?.status === "succeeded" &&
    scan.acquisitionMode === "durable_snapshot_reuse" &&
    scan.durableSnapshotProof?.requestedUtcDay ===
      params.collectionReport.run.collectionDate
  );
};

const githubIsTerminallyVerified = (params: {
  readonly readiness: YesterdaySocialProviderReadiness;
  readonly providers: readonly ProductionDayProviderDiagnostic[];
  readonly collectionReport: CleanRealDayCollectionReport;
}): boolean => {
  const github = params.providers.find(
    (provider) => provider.providerKey === "github-trending-page",
  );
  return (
    githubHasVerifiedExactDayEvidence(params) ||
    (github?.state === "unavailable" &&
      unavailableProviderIsExplicit(github, params.collectionReport))
  );
};

const onlyProviderScan = (
  report: CleanRealDayCollectionReport,
  providerKey: CleanRealDayCollectionProviderKey,
): CleanRealDayCollectionReport["scans"][number] | undefined => {
  const matches = report.scans.filter(
    (scan) => scan.providerKey === providerKey,
  );
  return matches.length === 1 ? matches[0] : undefined;
};

const databaseReportMatchesRequestedDay = (
  report: ProductionDayDatabaseQualityReport | null,
  collectionDate: string,
): boolean =>
  report?.schemaVersion === 1 &&
  report.artifactFormat === "yesterday-social-collection-quality-report-v1" &&
  report.generatedBy === "npm run check:yesterday-social-collection-quality" &&
  report.collectionDate === collectionDate &&
  report.model?.liveNetwork === false &&
  report.inputs?.postgresFeedWindow?.startInclusive ===
    `${collectionDate}T00:00:00.000Z` &&
  report.inputs?.postgresFeedWindow?.endExclusive ===
    nextUtcDate(collectionDate);

const collectionReportMatchesRequestedDay = (
  report: CleanRealDayCollectionReport | null,
  collectionDate: string,
): boolean =>
  report?.schemaVersion === 1 &&
  report.artifactFormat === "reader-summary-clean-real-day-collection-v1" &&
  report.generatedBy ===
    "npm run run:reader-summary-clean-real-day-collection" &&
  report.run?.collectionDate === collectionDate &&
  report.inputs?.database === "local-postgres" &&
  report.inputs?.targetPublishedWindow?.startInclusive ===
    `${collectionDate}T00:00:00.000Z` &&
  report.inputs?.targetPublishedWindow?.endExclusive ===
    nextUtcDate(collectionDate);

const providerCollectionGateNames = new Set([
  "everyRequestedProviderSucceeded",
  "everyRequestedProviderHasTargetItems",
  "everyRequestedProviderMeetsCollectionSlo",
  "everyRequestedProviderMeetsBlockingCoveragePolicy",
]);

const requiredNonProviderCollectionGateNames = [
  "targetBindingsPresent",
  "targetWindowFeedItemsAvailable",
  "noFreshOrphanInterestReferences",
  "noFreshOrphanSourceBindingReferences",
  "targetInterestSnapshotsPersisted",
  "targetSourceBindingSnapshotsPersisted",
  "providerCollectionObservabilityComplete",
  "providerAcquisitionModesAreConsistent",
  "providerRetriesAreBounded",
  "durableSnapshotReuseIsSingleAttempt",
  "durableSnapshotProofMatchesRequestedDay",
  "partialProviderCoverageIsExplicit",
  "noRawSecretFragments",
] as const;

const nonProviderCollectionGatesPass = (
  gates: Readonly<Record<string, boolean>>,
): boolean =>
  requiredNonProviderCollectionGateNames.every(
    (name) => gates[name] === true,
  ) &&
  Object.entries(gates).every(
    ([name, passed]) => providerCollectionGateNames.has(name) || passed,
  );

const blockedReadiness = (
  readiness: YesterdaySocialProviderReadiness,
  barrierMessage: string,
): ProductionDayProviderReadiness => ({
  status: "blocked",
  summaryPolicy: "blocked",
  collectionDate: readiness.collectionDate,
  diagnosticsOwner: "postgres_feed_items_published_window",
  providers: [],
  readiness,
  barrierMessage,
});

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const nextUtcDate = (collectionDate: string): string => {
  const value = new Date(`${collectionDate}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString();
};
