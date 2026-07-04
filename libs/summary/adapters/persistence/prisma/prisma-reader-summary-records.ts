import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import {
  ReaderSummaryArtifact,
  buildReaderSummaryPeriod,
  type ReaderSummaryDedupeStrategy,
  ReaderSummaryJob,
  type ReaderSummaryJobProps,
  type ReaderSummaryJobStatus,
  ReaderSummaryPolicy,
  type ReaderSummaryPolicyFormat,
  type ReaderSummaryPolicyLanguage,
  type ReaderSummaryPolicyProps,
  type ReaderSummaryScheduleSettings,
  type ReaderSummaryPolicyTone,
  type ReaderSummaryScope,
  type ScheduledReaderSummaryCadence,
  readerSummaryScopeKey,
} from "../../../domain";
import {
  normalizeReaderSummaryArtifactPayload,
  readerSummaryScopeFromPrisma,
} from "./prisma-reader-summary-artifact-payload";
import type { PrismaSummaryStatus } from "./prisma-summary-records";

export type PrismaReaderSummaryJobRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly scopeType: string;
  readonly scopeKey: string;
  readonly interestId: string | null;
  readonly cadence: string;
  readonly periodStartedAt: Date;
  readonly periodEndedAt: Date;
  readonly periodTimezone: string;
  readonly periodKey: string;
  readonly userId: string | null;
  readonly subscriptionId: string | null;
  readonly status: PrismaSummaryStatus;
  readonly idempotencyKey: string;
  readonly requestedAt: Date;
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
  readonly failedAt: Date | null;
  readonly readerSummaryArtifactId: string | null;
  readonly failureReason: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type PrismaReaderSummaryArtifactRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly scopeType: string;
  readonly scopeKey: string;
  readonly interestId: string | null;
  readonly cadence: string;
  readonly periodStartedAt: Date;
  readonly periodEndedAt: Date;
  readonly periodTimezone: string;
  readonly periodKey: string;
  readonly userId: string | null;
  readonly subscriptionId: string | null;
  readonly status: PrismaSummaryStatus;
  readonly schemaVersion: number;
  readonly modelVersion: string;
  readonly promptVersion: string;
  readonly headline: string;
  readonly summaryText: string | null;
  readonly artifactPayload: unknown;
  readonly citations: unknown;
  readonly qualitySignals: unknown;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type PrismaReaderSummaryPeriodSummaryRecord = Pick<
  PrismaReaderSummaryArtifactRecord,
  | "id"
  | "tenantId"
  | "workspaceId"
  | "scopeType"
  | "scopeKey"
  | "interestId"
  | "cadence"
  | "periodStartedAt"
  | "periodEndedAt"
  | "periodTimezone"
  | "periodKey"
  | "userId"
  | "subscriptionId"
  | "status"
  | "headline"
>;

export type PrismaReaderSummaryPolicyRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly scopeType: string;
  readonly scopeKey: string;
  readonly interestId: string | null;
  readonly language: string;
  readonly format: string;
  readonly tone: string;
  readonly maxStories: number;
  readonly includeRisks: boolean;
  readonly includeInterestHighlights: boolean;
  readonly includeRepeatedSignals: boolean;
  readonly dedupeStrategy: string;
  readonly customInstructions: string | null;
  readonly rulesVersion: string;
  readonly scheduleEnabled: boolean;
  readonly scheduleTimezone: string;
  readonly scheduleCadences: readonly string[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export const readerSummaryJobFromPrisma = (
  record: PrismaReaderSummaryJobRecord,
): ReaderSummaryJob =>
  ReaderSummaryJob.rehydrate({
    id: record.id,
    tenantId: tenantId(record.tenantId),
    workspaceId: workspaceId(record.workspaceId),
    scope: readerSummaryScopeFromPrisma(record),
    period: buildReaderSummaryPeriod({
      cadence: normalizeReaderSummaryCadence(record.cadence),
      startedAt: record.periodStartedAt,
      endedAt: record.periodEndedAt,
      timezone: record.periodTimezone,
    }),
    userId: record.userId ?? undefined,
    subscriptionId: record.subscriptionId ?? undefined,
    status: readerSummaryJobStatusFromPrisma(record.status),
    idempotencyKey: record.idempotencyKey,
    requestedAt: record.requestedAt,
    startedAt: record.startedAt ?? undefined,
    completedAt: record.completedAt ?? undefined,
    failedAt: record.failedAt ?? undefined,
    readerSummaryId: record.readerSummaryArtifactId ?? undefined,
    failureReason: record.failureReason ?? undefined,
  } satisfies ReaderSummaryJobProps);

export const readerSummaryArtifactFromPrisma = (
  record: PrismaReaderSummaryArtifactRecord,
): ReaderSummaryArtifact =>
  ReaderSummaryArtifact.rehydrate(
    normalizeReaderSummaryArtifactPayload(record.artifactPayload, record),
  );

export const readerSummaryPolicyFromPrisma = (
  record: PrismaReaderSummaryPolicyRecord,
): ReaderSummaryPolicy =>
  ReaderSummaryPolicy.rehydrate({
    id: record.id,
    tenantId: tenantId(record.tenantId),
    workspaceId: workspaceId(record.workspaceId),
    scope: readerSummaryScopeFromPrisma(record),
    language: normalizeReaderSummaryPolicyLanguage(record.language),
    format: normalizeReaderSummaryPolicyFormat(record.format),
    tone: normalizeReaderSummaryPolicyTone(record.tone),
    maxStories: record.maxStories,
    includeRisks: record.includeRisks,
    includeInterestHighlights: record.includeInterestHighlights,
    includeRepeatedSignals: record.includeRepeatedSignals,
    dedupeStrategy: normalizeReaderSummaryDedupeStrategy(record.dedupeStrategy),
    customInstructions: record.customInstructions ?? undefined,
    rulesVersion: record.rulesVersion,
    schedule: normalizeReaderSummaryScheduleSettings({
      enabled: record.scheduleEnabled,
      timezone: record.scheduleTimezone,
      cadences: record.scheduleCadences,
    }),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  } satisfies ReaderSummaryPolicyProps);

export const readerSummaryJobStatusToPrisma = (
  status: ReaderSummaryJobStatus,
): PrismaSummaryStatus => {
  if (status === "requested") {
    return "REQUESTED";
  }

  if (status === "running") {
    return "RUNNING";
  }

  if (status === "completed") {
    return "COMPLETED";
  }

  if (status === "no_signal") {
    return "NO_SIGNAL";
  }

  return "FAILED";
};

export const readerSummaryArtifactStatusToPrisma = (
  artifact: ReaderSummaryArtifact,
): PrismaSummaryStatus =>
  artifact.toSnapshot().qualityFlags.includes("no_signal")
    ? "NO_SIGNAL"
    : "COMPLETED";

export const serializeReaderSummaryArtifact = (
  artifact: ReaderSummaryArtifact,
): Readonly<Record<string, unknown>> => {
  const snapshot = artifact.toSnapshot();

  return {
    ...snapshot,
    period: {
      cadence: snapshot.period.cadence,
      startedAt: snapshot.period.startedAt.toISOString(),
      endedAt: snapshot.period.endedAt.toISOString(),
      timezone: snapshot.period.timezone,
      periodKey: snapshot.period.periodKey,
    },
    sourceWindow: {
      ...snapshot.sourceWindow,
      startedAt: snapshot.sourceWindow.startedAt.toISOString(),
      endedAt: snapshot.sourceWindow.endedAt.toISOString(),
    },
    storyClusters: snapshot.storyClusters.map((cluster) => ({
      ...cluster,
      observedAtRange: {
        startedAt: cluster.observedAtRange.startedAt.toISOString(),
        endedAt: cluster.observedAtRange.endedAt.toISOString(),
      },
    })),
    contextArtifacts: snapshot.contextArtifacts.map((contextArtifact) => ({
      ...contextArtifact,
      period: {
        cadence: contextArtifact.period.cadence,
        startedAt: contextArtifact.period.startedAt.toISOString(),
        endedAt: contextArtifact.period.endedAt.toISOString(),
        timezone: contextArtifact.period.timezone,
        periodKey: contextArtifact.period.periodKey,
      },
      generatedAt: contextArtifact.generatedAt.toISOString(),
    })),
  };
};

export const readerSummaryQualitySignalsToPrisma = (
  artifact: ReaderSummaryArtifact,
): Readonly<Record<string, unknown>> => {
  const snapshot = artifact.toSnapshot();

  return {
    qualityFlags: snapshot.qualityFlags,
    confidence: snapshot.confidence,
    usage: snapshot.usage,
  };
};

export const readerSummaryScopeToPrisma = (
  scope: ReaderSummaryScope,
): {
  readonly scopeType: string;
  readonly scopeKey: string;
  readonly interestId: string | null;
} => ({
  scopeType: scope.type,
  scopeKey: readerSummaryScopeKey(scope),
  interestId: scope.type === "interest" ? scope.interestId : null,
});

const readerSummaryJobStatusFromPrisma = (
  status: PrismaSummaryStatus,
): ReaderSummaryJobStatus => {
  if (status === "REQUESTED") {
    return "requested";
  }

  if (status === "RUNNING") {
    return "running";
  }

  if (status === "COMPLETED") {
    return "completed";
  }

  if (status === "NO_SIGNAL") {
    return "no_signal";
  }

  if (status === "FAILED") {
    return "failed";
  }

  throw new Error(
    `Cannot rehydrate unsupported reader summary job status "${status}"`,
  );
};

const normalizeReaderSummaryPolicyLanguage = (
  value: string,
): ReaderSummaryPolicyLanguage => {
  if (value === "auto" || value === "en" || value === "ru") {
    return value;
  }

  throw new Error(`Unsupported reader summary policy language "${value}"`);
};

const normalizeReaderSummaryPolicyFormat = (
  value: string,
): ReaderSummaryPolicyFormat => {
  if (
    value === "executive_brief" ||
    value === "bullet_digest" ||
    value === "risk_brief"
  ) {
    return value;
  }

  throw new Error(`Unsupported reader summary policy format "${value}"`);
};

const normalizeReaderSummaryPolicyTone = (
  value: string,
): ReaderSummaryPolicyTone => {
  if (value === "neutral" || value === "concise" || value === "analytical") {
    return value;
  }

  throw new Error(`Unsupported reader summary policy tone "${value}"`);
};

const normalizeReaderSummaryCadence = (
  value: string,
): "daily" | "weekly" | "monthly" | "custom" => {
  if (
    value === "daily" ||
    value === "weekly" ||
    value === "monthly" ||
    value === "custom"
  ) {
    return value;
  }

  throw new Error(`Unsupported reader summary cadence "${value}"`);
};

const normalizeReaderSummaryDedupeStrategy = (
  value: string,
): ReaderSummaryDedupeStrategy => {
  if (value === "canonical_url_then_title") {
    return value;
  }

  throw new Error(`Unsupported reader summary dedupe strategy "${value}"`);
};

const normalizeReaderSummaryScheduleSettings = (value: {
  readonly enabled: boolean;
  readonly timezone: string;
  readonly cadences: readonly string[];
}): ReaderSummaryScheduleSettings => ({
  enabled: value.enabled,
  timezone: value.timezone,
  cadences: value.cadences.map(normalizeScheduledReaderSummaryCadence),
});

const normalizeScheduledReaderSummaryCadence = (
  value: string,
): ScheduledReaderSummaryCadence => {
  if (value === "daily" || value === "weekly" || value === "monthly") {
    return value;
  }

  throw new Error(`Unsupported scheduled reader summary cadence "${value}"`);
};
