import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import {
  ReaderSummaryArtifact,
  type ReaderSummaryDedupeStrategy,
  ReaderSummaryJob,
  type ReaderSummaryJobProps,
  type ReaderSummaryJobStatus,
  ReaderSummaryPolicy,
  type ReaderSummaryPolicyFormat,
  type ReaderSummaryPolicyLanguage,
  type ReaderSummaryPolicyProps,
  type ReaderSummaryPolicyTone,
  type ReaderSummaryScope,
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
  readonly topicId: string | null;
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
  readonly topicId: string | null;
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

export type PrismaReaderSummaryPolicyRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly scopeType: string;
  readonly scopeKey: string;
  readonly topicId: string | null;
  readonly language: string;
  readonly format: string;
  readonly tone: string;
  readonly maxStories: number;
  readonly includeRisks: boolean;
  readonly includeTopicHighlights: boolean;
  readonly includeRepeatedSignals: boolean;
  readonly dedupeStrategy: string;
  readonly customInstructions: string | null;
  readonly rulesVersion: string;
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
    includeTopicHighlights: record.includeTopicHighlights,
    includeRepeatedSignals: record.includeRepeatedSignals,
    dedupeStrategy: normalizeReaderSummaryDedupeStrategy(record.dedupeStrategy),
    customInstructions: record.customInstructions ?? undefined,
    rulesVersion: record.rulesVersion,
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
  readonly topicId: string | null;
} => ({
  scopeType: scope.type,
  scopeKey: readerSummaryScopeKey(scope),
  topicId: scope.type === "topic" ? scope.topicId : null,
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

const normalizeReaderSummaryDedupeStrategy = (
  value: string,
): ReaderSummaryDedupeStrategy => {
  if (value === "canonical_url_then_title") {
    return value;
  }

  throw new Error(`Unsupported reader summary dedupe strategy "${value}"`);
};
