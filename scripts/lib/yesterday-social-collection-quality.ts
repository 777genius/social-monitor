import {
  defaultCleanRealDayCollectionProviderKeys,
  type CleanRealDayCollectionProviderKey,
  type CleanRealDayCollectionReport,
} from "./clean-real-day-collection-report";
import {
  evaluateProductionProviderCollectionState,
  type ProductionProviderCollectionState,
} from "./production-collection-quality-policy";

export type YesterdaySocialProviderState = Omit<
  ProductionProviderCollectionState,
  "state"
> & {
  readonly providerKey: CleanRealDayCollectionProviderKey;
  readonly state:
    | ProductionProviderCollectionState["state"]
    | "missing"
    | "invalid";
  readonly feedItemCount: number;
};

export type YesterdaySocialProviderReadiness = {
  readonly ready: boolean;
  readonly policy: "complete" | "explicit_partial" | "blocked";
  readonly collectionDate: string;
  readonly requiredProviderKeys: readonly CleanRealDayCollectionProviderKey[];
  readonly providerStates: readonly YesterdaySocialProviderState[];
  readonly readyProviderKeys: readonly CleanRealDayCollectionProviderKey[];
  readonly blockingProviderKeys: readonly CleanRealDayCollectionProviderKey[];
  readonly missingProviderKeys: readonly CleanRealDayCollectionProviderKey[];
  readonly duplicateProviderKeys: readonly CleanRealDayCollectionProviderKey[];
  readonly emptyProviderKeys: readonly CleanRealDayCollectionProviderKey[];
  readonly partialProviderKeys: readonly CleanRealDayCollectionProviderKey[];
  readonly unavailableProviderKeys: readonly CleanRealDayCollectionProviderKey[];
  readonly retrySchedule: {
    readonly disposition: "scheduled";
    readonly notBefore: string;
    readonly providerKeys: readonly CleanRealDayCollectionProviderKey[];
    readonly reason: "blocking_provider_retry";
  } | null;
  readonly barrierMessage: string | null;
};

type CollectionQualityProviderReport = {
  readonly providerKey: string;
  readonly feedItemCount: number;
};

export type YesterdaySocialCollectionQualityInput = {
  readonly collectionDate: string;
  readonly providerReports: readonly CollectionQualityProviderReport[];
};

export const evaluateYesterdaySocialProviderReadiness = (params: {
  readonly expectedCollectionDate: string;
  readonly evaluatedAt: Date;
  readonly report: YesterdaySocialCollectionQualityInput | null;
  readonly collectionReport: CleanRealDayCollectionReport | null;
  readonly requiredProviderKeys?: readonly CleanRealDayCollectionProviderKey[];
}): YesterdaySocialProviderReadiness => {
  if (!Number.isFinite(params.evaluatedAt.getTime())) {
    throw new Error("Provider readiness evaluation time is invalid");
  }
  const requiredProviderKeys =
    params.requiredProviderKeys ?? defaultCleanRealDayCollectionProviderKeys;
  const expectedWindow = {
    startInclusive: `${params.expectedCollectionDate}T00:00:00.000Z`,
    endExclusive: nextUtcDate(params.expectedCollectionDate),
  };
  const qualityReportValid =
    params.report?.collectionDate === params.expectedCollectionDate;
  const collectionReportValid =
    params.collectionReport?.schemaVersion === 1 &&
    params.collectionReport.artifactFormat ===
      "reader-summary-clean-real-day-collection-v1" &&
    params.collectionReport.run.collectionDate ===
      params.expectedCollectionDate &&
    params.collectionReport.inputs.targetPublishedWindow.startInclusive ===
      expectedWindow.startInclusive &&
    params.collectionReport.inputs.targetPublishedWindow.endExclusive ===
      expectedWindow.endExclusive;
  const closedRequestedUtcDay =
    params.evaluatedAt.getTime() >=
    new Date(expectedWindow.endExclusive).getTime();
  const providerStates = requiredProviderKeys.map((providerKey) =>
    providerState({
      providerKey,
      collectionDate: params.expectedCollectionDate,
      closedRequestedUtcDay,
      qualityReports: qualityReportValid
        ? (params.report?.providerReports ?? []).filter(
            (provider) => provider.providerKey === providerKey,
          )
        : [],
      collectionReport: collectionReportValid
        ? params.collectionReport
        : null,
      qualityReportValid,
      collectionReportValid,
    }),
  );
  const readyProviderKeys = providerStates
    .filter((state) => state.policy === "accepted")
    .map((state) => state.providerKey);
  const blockingProviderKeys = providerStates
    .filter((state) => state.policy === "blocking")
    .map((state) => state.providerKey);
  const ready = blockingProviderKeys.length === 0;
  const retrySchedule = ready
    ? null
    : {
        disposition: "scheduled" as const,
        notBefore: new Date(
          params.evaluatedAt.getTime() +
            retryDelayMs(
              providerStates.filter(
                (state) => state.policy === "blocking",
              ),
            ),
        ).toISOString(),
        providerKeys: blockingProviderKeys,
        reason: "blocking_provider_retry" as const,
      };

  return {
    ready,
    policy: ready
      ? providerStates.every((state) => state.state === "complete")
        ? "complete"
        : "explicit_partial"
      : "blocked",
    collectionDate: params.expectedCollectionDate,
    requiredProviderKeys,
    providerStates,
    readyProviderKeys,
    blockingProviderKeys,
    missingProviderKeys: keysInState(providerStates, "missing"),
    duplicateProviderKeys: providerStates
      .filter((state) =>
        state.reasonCodes.some((reason) => reason.endsWith("_duplicated")),
      )
      .map((state) => state.providerKey),
    emptyProviderKeys: providerStates
      .filter(
        (state) =>
          state.feedItemCount <= 0 &&
          !(
            state.policy === "accepted" &&
            state.evidence === "explicit_unavailable"
          ),
      )
      .map((state) => state.providerKey),
    partialProviderKeys: keysInState(providerStates, "partial"),
    unavailableProviderKeys: keysInState(providerStates, "unavailable"),
    retrySchedule,
    barrierMessage: ready
      ? null
      : `Provider policy blocked ${params.expectedCollectionDate}: ${providerStates
          .filter((state) => state.policy === "blocking")
          .map(
            (state) =>
              `${state.providerKey}=${state.state}(${state.reasonCodes.join(",") || "policy"})`,
          )
          .join("; ")}`,
  };
};

const providerState = (params: {
  readonly providerKey: CleanRealDayCollectionProviderKey;
  readonly collectionDate: string;
  readonly closedRequestedUtcDay: boolean;
  readonly qualityReports: readonly CollectionQualityProviderReport[];
  readonly collectionReport: CleanRealDayCollectionReport | null;
  readonly qualityReportValid: boolean;
  readonly collectionReportValid: boolean;
}): YesterdaySocialProviderState => {
  const scans =
    params.collectionReport?.scans.filter(
      (scan) => scan.providerKey === params.providerKey,
    ) ?? [];
  const targets =
    params.collectionReport?.targets.filter(
      (target) => target.providerKey === params.providerKey,
    ) ?? [];
  const feedItemCount =
    params.collectionReport?.targetWindow.providerCounts[params.providerKey] ??
    0;
  if (
    !params.qualityReportValid ||
    !params.collectionReportValid ||
    scans.length !== 1 ||
    targets.length !== 1
  ) {
    const reasonCodes = [
      ...(params.qualityReportValid ? [] : ["quality_report_missing_or_stale"]),
      ...(params.collectionReportValid
        ? []
        : ["collection_report_missing_or_stale"]),
      ...(scans.length === 0
        ? ["scan_evidence_missing"]
        : scans.length > 1
          ? ["scan_evidence_duplicated"]
          : []),
      ...(targets.length === 0
        ? ["target_evidence_missing"]
        : targets.length > 1
          ? ["target_evidence_duplicated"]
          : []),
    ];
    return {
      providerKey: params.providerKey,
      state:
        scans.length === 0 || targets.length === 0 ? "missing" : "invalid",
      evidence: "invalid",
      policy: "blocking",
      feedItemCount,
      reasonCodes,
      retryDisposition: "immediate",
    };
  }

  const collectionState = evaluateProductionProviderCollectionState({
    collectionDate: params.collectionDate,
    closedRequestedUtcDay: params.closedRequestedUtcDay,
    scan: scans[0]!,
    targetWindowItemCount: feedItemCount,
  });
  const explicitlyUnavailable =
    collectionState.evidence === "explicit_unavailable";
  const successfulCollectionCanPrecedeProjectionGrowth =
    scans[0]!.status === "succeeded";
  const qualityEvidenceMatches = explicitlyUnavailable
    ? params.qualityReports.length === 0
    : params.qualityReports.length === 1 &&
      Number.isFinite(params.qualityReports[0]!.feedItemCount) &&
      params.qualityReports[0]!.feedItemCount > 0 &&
      (params.qualityReports[0]!.feedItemCount === feedItemCount ||
        (successfulCollectionCanPrecedeProjectionGrowth &&
          params.qualityReports[0]!.feedItemCount >= feedItemCount));
  const qualityReasons = qualityEvidenceMatches
    ? []
    : params.qualityReports.length === 0
      ? ["quality_provider_evidence_missing"]
      : params.qualityReports.length > 1
        ? ["quality_provider_evidence_duplicated"]
        : ["quality_provider_count_mismatch"];

  return {
    providerKey: params.providerKey,
    ...collectionState,
    state: qualityEvidenceMatches
      ? collectionState.state
      : params.qualityReports.length === 0
        ? "missing"
        : "invalid",
    policy:
      collectionState.policy === "accepted" && qualityEvidenceMatches
        ? "accepted"
        : "blocking",
    feedItemCount,
    reasonCodes: [...collectionState.reasonCodes, ...qualityReasons],
    retryDisposition:
      collectionState.policy === "accepted" && qualityEvidenceMatches
        ? "none"
        : collectionState.retryDisposition === "deferred"
          ? "deferred"
          : "immediate",
  };
};

const retryDelayMs = (
  states: readonly YesterdaySocialProviderState[],
): number =>
  states.some((state) => state.retryDisposition === "deferred")
    ? 60 * 60_000
    : 15 * 60_000;

const keysInState = (
  states: readonly YesterdaySocialProviderState[],
  state: YesterdaySocialProviderState["state"],
): readonly CleanRealDayCollectionProviderKey[] =>
  states
    .filter((providerState) => providerState.state === state)
    .map((providerState) => providerState.providerKey);

const nextUtcDate = (collectionDate: string): string => {
  const value = new Date(`${collectionDate}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString();
};
