import type { ReaderSummaryTimestampPolicy } from "@social-monitor/summary/ports";

export const liveObservationCutoffEnv =
  "DURABLE_READER_SUMMARY_LIVE_OBSERVATION_CUTOFF";
const recoveryTimestampPolicyEnv =
  "DURABLE_READER_SUMMARY_RECOVERY_TIMESTAMP_POLICY";

type ReaderSummaryCaptureCadence =
  | "daily"
  | "weekly"
  | "monthly"
  | "custom";

export const startOfUtcDay = (date: Date): Date =>
  new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );

export const addUtcDays = (date: Date, days: number): Date =>
  new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

export const resolveRecoveryTimestampPolicy = (params: {
  readonly argv: readonly string[];
  readonly envValue?: string;
  readonly cadence: ReaderSummaryCaptureCadence;
  readonly timezone: string;
  readonly periodStartedAt: Date;
  readonly periodEndedAt: Date;
  readonly now: Date;
}): {
  readonly active: boolean;
  readonly policy: ReaderSummaryTimestampPolicy;
} => {
  const explicitlyHistorical = params.argv.includes("--historical-recovery");
  if (!explicitlyHistorical && params.envValue === undefined) {
    return { active: false, policy: "published_at" };
  }
  if (!explicitlyHistorical || params.envValue === undefined) {
    throw new Error(
      `Historical recovery requires both --historical-recovery and ${recoveryTimestampPolicyEnv}`,
    );
  }
  if (
    params.envValue !== "published_at" &&
    params.envValue !== "observed_at"
  ) {
    throw new Error(
      `${recoveryTimestampPolicyEnv} must be published_at or observed_at`,
    );
  }
  if (
    params.cadence !== "daily" ||
    params.timezone !== "UTC" ||
    params.periodStartedAt.toISOString() !==
      `${params.periodStartedAt.toISOString().slice(0, 10)}T00:00:00.000Z` ||
    params.periodEndedAt.getTime() - params.periodStartedAt.getTime() !==
      86_400_000 ||
    params.periodEndedAt.getTime() > params.now.getTime()
  ) {
    throw new Error(
      "Historical recovery timestamp policy is restricted to one completed exact UTC day",
    );
  }
  return { active: true, policy: params.envValue };
};

export const resolveLiveObservationCutoff = (params: {
  readonly value: Date | undefined;
  readonly dailyReplayActive: boolean;
  readonly recoveryActive: boolean;
  readonly cadence: ReaderSummaryCaptureCadence;
  readonly timezone: string;
  readonly periodStartedAt: Date;
  readonly periodEndedAt: Date;
  readonly now: Date;
}): Date | undefined => {
  if (params.value === undefined) {
    return undefined;
  }
  if (
    params.dailyReplayActive ||
    params.recoveryActive ||
    params.cadence !== "daily" ||
    params.timezone !== "UTC" ||
    params.periodEndedAt.getTime() - params.periodStartedAt.getTime() !==
      86_400_000 ||
    params.value.getTime() < params.periodStartedAt.getTime() ||
    params.value.getTime() >= params.periodEndedAt.getTime() ||
    params.value.getTime() > params.now.getTime()
  ) {
    throw new Error(
      `${liveObservationCutoffEnv} requires a current exact UTC daily period`,
    );
  }

  return params.value;
};
