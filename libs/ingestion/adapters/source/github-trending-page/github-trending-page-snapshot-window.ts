import type { GitHubTrendingPageWindow } from "../../../domain";
import type { SourceRuntimeConfig } from "../../../ports";

type DailySnapshotWindow = {
  readonly startInclusive: Date;
  readonly endExclusive: Date;
};

export const githubTrendingDailySnapshotWindow = (params: {
  readonly config: SourceRuntimeConfig | undefined;
  readonly window: GitHubTrendingPageWindow;
  readonly fetchStartedAt: Date;
}): DailySnapshotWindow | undefined => {
  if (params.window !== "daily") {
    return undefined;
  }
  if (params.config?.targetPublishedWindow === undefined) {
    const startInclusive = new Date(params.fetchStartedAt);
    startInclusive.setUTCHours(0, 0, 0, 0);
    const endExclusive = new Date(startInclusive);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    return { startInclusive, endExclusive };
  }

  const rawWindow = params.config.targetPublishedWindow;
  if (
    rawWindow === null ||
    typeof rawWindow !== "object" ||
    Array.isArray(rawWindow)
  ) {
    throw invalidTargetWindow();
  }
  const record = rawWindow as Readonly<Record<string, unknown>>;
  const startInclusive = exactIsoDate(record.startInclusive);
  const endExclusive = exactIsoDate(record.endExclusive);
  if (
    startInclusive === undefined ||
    endExclusive === undefined ||
    !isUtcMidnight(startInclusive) ||
    endExclusive.getTime() - startInclusive.getTime() !== 86_400_000
  ) {
    throw invalidTargetWindow();
  }
  return { startInclusive, endExclusive };
};

export const assertGitHubTrendingSnapshotTimeInWindow = (
  value: Date,
  window: DailySnapshotWindow | undefined,
  label: "fetchStartedAt" | "checkedAt",
): void => {
  const timestamp = value.getTime();
  if (!Number.isFinite(timestamp)) {
    throw new Error(`GitHub Trending daily ${label} must be valid`);
  }
  if (
    window !== undefined &&
    (timestamp < window.startInclusive.getTime() ||
      timestamp >= window.endExclusive.getTime())
  ) {
    throw new Error(
      `GitHub Trending daily ${label} must belong to the requested UTC day`,
    );
  }
};

const exactIsoDate = (value: unknown): Date | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value
    ? parsed
    : undefined;
};

const isUtcMidnight = (value: Date): boolean =>
  value.getUTCHours() === 0 &&
  value.getUTCMinutes() === 0 &&
  value.getUTCSeconds() === 0 &&
  value.getUTCMilliseconds() === 0;

const invalidTargetWindow = (): Error =>
  new Error(
    "GitHub Trending daily targetPublishedWindow must be one exact UTC day",
  );
