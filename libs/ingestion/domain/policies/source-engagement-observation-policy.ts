import type { SourceEngagementMetrics } from "../value-objects/source-engagement-metrics";

const minuteMs = 60_000;
const observationBucketMs = 30 * minuteMs;

export const engagementObservationBucketStartedAt = (observedAt: Date): Date =>
  new Date(Math.floor(observedAt.getTime() / observationBucketMs) * observationBucketMs);

export const nextEngagementObservationDueAt = (params: {
  readonly publishedAt: Date;
  readonly observedAt: Date;
}): Date => {
  const ageHours = Math.max(
    0,
    (params.observedAt.getTime() - params.publishedAt.getTime()) / 3_600_000,
  );
  const intervalMinutes =
    ageHours < 6
      ? 30
      : ageHours < 24
        ? 60
        : ageHours < 72
          ? 180
          : ageHours < 168
            ? 720
            : 1_440;

  return new Date(params.observedAt.getTime() + intervalMinutes * minuteMs);
};

export const engagementMetricsHaveRegression = (params: {
  readonly previous: SourceEngagementMetrics;
  readonly current: SourceEngagementMetrics;
}): boolean =>
  Object.entries(params.current).some(([key, current]) => {
    const previous = params.previous[key as keyof SourceEngagementMetrics];
    if (previous === undefined || current === undefined) {
      return false;
    }
    return key === "providerRank" ? current > previous : current < previous;
  });

export const peakEngagementMetrics = (params: {
  readonly previous: SourceEngagementMetrics;
  readonly current: SourceEngagementMetrics;
}): SourceEngagementMetrics => {
  const entries = new Set([
    ...Object.keys(params.previous),
    ...Object.keys(params.current),
  ] as (keyof SourceEngagementMetrics)[]);
  return Object.fromEntries(
    [...entries].flatMap((key) => {
      const previous = params.previous[key];
      const current = params.current[key];
      if (previous === undefined) {
        return current === undefined ? [] : [[key, current] as const];
      }
      if (current === undefined) {
        return [[key, previous] as const];
      }
      return [
        [
          key,
          key === "providerRank"
            ? Math.min(previous, current)
            : Math.max(previous, current),
        ] as const,
      ];
    }),
  ) as SourceEngagementMetrics;
};
