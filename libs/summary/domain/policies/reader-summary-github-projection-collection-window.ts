export type ReaderSummaryGitHubProjectionCollectionTelemetry = {
  readonly github_projection_collection_delay_ms: number;
  readonly collectionGraceMs: number;
  readonly warningThresholdMs: number;
  readonly qualitySignal:
    | "within_grace"
    | "github_projection_collection_delay_warning";
};

export const readerSummaryGitHubProjectionCollectionGraceMs = 300_000;
export const readerSummaryGitHubProjectionCollectionWarningThresholdMs =
  readerSummaryGitHubProjectionCollectionGraceMs * 0.8;

export const githubProjectionTimesAreBounded = (params: {
  readonly dayStartedAt: Date;
  readonly dayEndedAt: Date;
  readonly observedThrough: Date;
  readonly publishedAt: Date;
  readonly fetchStartedAt: Date;
  readonly checkedAt: Date;
  readonly observedAt: Date;
}): boolean => {
  const dayStartedAt = params.dayStartedAt.getTime();
  const dayEndedAt = params.dayEndedAt.getTime();
  const observedThrough = params.observedThrough.getTime();
  const fetchStartedAt = params.fetchStartedAt.getTime();
  const publishedAt = params.publishedAt.getTime();
  const checkedAt = params.checkedAt.getTime();
  const observedAt = params.observedAt.getTime();
  return (
    [
      dayStartedAt,
      dayEndedAt,
      observedThrough,
      publishedAt,
      fetchStartedAt,
      checkedAt,
      observedAt,
    ].every(Number.isFinite) &&
    fetchStartedAt >= dayStartedAt &&
    fetchStartedAt < dayEndedAt &&
    checkedAt >= fetchStartedAt &&
    checkedAt < dayEndedAt &&
    publishedAt === checkedAt &&
    checkedAt <= observedThrough &&
    observedAt >= checkedAt &&
    observedAt <= observedThrough
  );
};

export const buildReaderSummaryGitHubProjectionCollectionTelemetry = (params: {
  readonly dayEndedAt: Date;
  readonly observedAt: readonly Date[];
}): ReaderSummaryGitHubProjectionCollectionTelemetry | undefined => {
  const dayEndedAt = params.dayEndedAt.getTime();
  const observedAt = params.observedAt.map((value) => value.getTime());
  const latestObservedAt = Math.max(...observedAt);
  if (
    observedAt.length === 0 ||
    !Number.isFinite(dayEndedAt) ||
    !Number.isFinite(latestObservedAt)
  ) {
    return undefined;
  }
  const collectionDelayMs = Math.max(0, latestObservedAt - dayEndedAt);
  if (!Number.isSafeInteger(collectionDelayMs)) {
    return undefined;
  }

  return {
    github_projection_collection_delay_ms: collectionDelayMs,
    collectionGraceMs: readerSummaryGitHubProjectionCollectionGraceMs,
    warningThresholdMs:
      readerSummaryGitHubProjectionCollectionWarningThresholdMs,
    qualitySignal:
      collectionDelayMs >=
      readerSummaryGitHubProjectionCollectionWarningThresholdMs
        ? "github_projection_collection_delay_warning"
        : "within_grace",
  };
};

export const exactUtcDay = (
  startedAt: Date,
  endedAt: Date,
  timezone: string,
):
  | { readonly day: string; readonly startedAt: Date; readonly endedAt: Date }
  | undefined => {
  const day = startedAt.toISOString().slice(0, 10);
  const expectedStart = new Date(`${day}T00:00:00.000Z`);
  const expectedEnd = new Date(expectedStart);
  expectedEnd.setUTCDate(expectedEnd.getUTCDate() + 1);
  return timezone === "UTC" &&
    startedAt.getTime() === expectedStart.getTime() &&
    endedAt.getTime() === expectedEnd.getTime()
    ? { day, startedAt: expectedStart, endedAt: expectedEnd }
    : undefined;
};
