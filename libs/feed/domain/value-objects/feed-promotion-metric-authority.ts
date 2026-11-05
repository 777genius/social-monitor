export type FeedPromotionMetricRegressionState =
  | "stable"
  | "confirmed_correction"
  | "unresolved_regression";

export type FeedPromotionMetricAuthority = {
  readonly observedAt: Date;
  readonly regressionState: FeedPromotionMetricRegressionState;
};

type DurablePromotionMetricObservation = {
  readonly observedAt: Date;
  readonly metricsHash: string;
  readonly hasRegression: boolean;
};

/** Resolves the current durable projection without consulting wall-clock time. */
export const feedPromotionMetricAuthority = (params: {
  readonly snapshotObservedAt: Date;
  readonly snapshotChangedAt: Date;
  readonly snapshotMetricsHash: string;
  readonly currentHasRegressionFromLatest: boolean;
  readonly latestObservation?: DurablePromotionMetricObservation;
  readonly previousObservation?: DurablePromotionMetricObservation;
}): FeedPromotionMetricAuthority | undefined => {
  const latest = params.latestObservation;
  if (!validDate(params.snapshotObservedAt) ||
      !validDate(params.snapshotChangedAt) ||
      params.snapshotChangedAt.getTime() > params.snapshotObservedAt.getTime() ||
      params.snapshotMetricsHash.trim().length === 0 || latest === undefined ||
      !validObservation(latest) ||
      latest.observedAt.getTime() > params.snapshotObservedAt.getTime()) {
    return undefined;
  }
  const previous = params.previousObservation;
  if (previous !== undefined && (!validObservation(previous) ||
      previous.observedAt.getTime() >= latest.observedAt.getTime())) {
    return undefined;
  }

  const snapshotMatchesLatest =
    params.snapshotMetricsHash === latest.metricsHash;
  const currentProjectionRepeated = params.snapshotChangedAt.getTime() <
    params.snapshotObservedAt.getTime();
  const confirmedAfterLatestRegression = snapshotMatchesLatest &&
    latest.hasRegression && currentProjectionRepeated;
  const confirmedCurrentRegression =
    params.currentHasRegressionFromLatest && currentProjectionRepeated;
  const confirmedByLatestObservation = !latest.hasRegression &&
    previous?.hasRegression === true &&
    latest.metricsHash === previous.metricsHash;
  const unresolvedRegression = snapshotMatchesLatest
    ? latest.hasRegression && !confirmedAfterLatestRegression
    : params.currentHasRegressionFromLatest && !confirmedCurrentRegression;

  return {
    observedAt: new Date(params.snapshotObservedAt),
    regressionState: unresolvedRegression
      ? "unresolved_regression"
      : confirmedAfterLatestRegression || confirmedCurrentRegression ||
          confirmedByLatestObservation
        ? "confirmed_correction"
        : "stable",
  };
};

const validObservation = (
  observation: DurablePromotionMetricObservation,
): boolean => validDate(observation.observedAt) &&
  observation.metricsHash.trim().length > 0;

const validDate = (value: Date): boolean => Number.isFinite(value.getTime());
