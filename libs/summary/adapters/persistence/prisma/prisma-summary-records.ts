import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import {
  isSummaryFeedbackCategory,
  SummaryArtifact,
  type SummaryArtifactProps,
  type SummaryCitation,
  type SummaryConfidence,
  SummaryFeedback,
  type SummaryFeedbackCategory,
  type SummaryFeedbackEvidence,
  type SummaryFeedbackProps,
  type SummaryFeedbackTriageOwner,
  SummaryJob,
  type SummaryJobProps,
  type SummaryJobStatus,
  type SummaryKeyPoint,
  type SummaryLineage,
  type SummaryQualityFlag,
  type SummaryRisk,
  type SummaryUsage,
} from '../../../domain';

export type PrismaSummaryStatus = 'REQUESTED' | 'RUNNING' | 'COMPLETED' | 'NO_SIGNAL' | 'FAILED' | 'REJECTED';

export type PrismaSummaryJobRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly topicId: string;
  readonly status: PrismaSummaryStatus;
  readonly idempotencyKey: string;
  readonly requestedAt: Date;
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
  readonly failedAt: Date | null;
  readonly summaryArtifactId: string | null;
  readonly failureReason: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type PrismaSummaryArtifactRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly topicId: string;
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

export type PrismaSummaryFeedbackRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly summaryArtifactId: string;
  readonly topicId: string;
  readonly idempotencyKey: string;
  readonly submittedBy: string;
  readonly rating: number;
  readonly category: string;
  readonly triageOwner: string;
  readonly eligibleForEvalFixture: boolean;
  readonly note: string | null;
  readonly evidence: unknown;
  readonly createdAt: Date;
};

export const summaryJobFromPrisma = (record: PrismaSummaryJobRecord): SummaryJob =>
  SummaryJob.rehydrate({
    id: record.id,
    tenantId: tenantId(record.tenantId),
    workspaceId: workspaceId(record.workspaceId),
    topicId: record.topicId,
    status: summaryJobStatusFromPrisma(record.status),
    idempotencyKey: record.idempotencyKey,
    requestedAt: record.requestedAt,
    startedAt: record.startedAt ?? undefined,
    completedAt: record.completedAt ?? undefined,
    failedAt: record.failedAt ?? undefined,
    summaryId: record.summaryArtifactId ?? undefined,
    failureReason: record.failureReason ?? undefined,
  } satisfies SummaryJobProps);

export const summaryArtifactFromPrisma = (record: PrismaSummaryArtifactRecord): SummaryArtifact =>
  SummaryArtifact.rehydrate(normalizeArtifactPayload(record.artifactPayload, record));

export const summaryFeedbackFromPrisma = (record: PrismaSummaryFeedbackRecord): SummaryFeedback =>
  SummaryFeedback.rehydrate({
    id: record.id,
    tenantId: tenantId(record.tenantId),
    workspaceId: workspaceId(record.workspaceId),
    summaryId: record.summaryArtifactId,
    topicId: record.topicId,
    idempotencyKey: record.idempotencyKey,
    submittedBy: record.submittedBy,
    rating: record.rating,
    category: normalizeFeedbackCategory(record.category),
    comment: record.note ?? undefined,
    evidence: normalizeFeedbackEvidence(record.evidence, record.summaryArtifactId, record.topicId),
    triageOwner: normalizeTriageOwner(record.triageOwner),
    eligibleForEvalFixture: record.eligibleForEvalFixture,
    createdAt: record.createdAt,
  } satisfies SummaryFeedbackProps);

export const summaryJobStatusToPrisma = (status: SummaryJobStatus): PrismaSummaryStatus => {
  if (status === 'requested') {
    return 'REQUESTED';
  }

  if (status === 'running') {
    return 'RUNNING';
  }

  if (status === 'completed') {
    return 'COMPLETED';
  }

  if (status === 'no_signal') {
    return 'NO_SIGNAL';
  }

  return 'FAILED';
};

export const summaryArtifactStatusToPrisma = (artifact: SummaryArtifact): PrismaSummaryStatus =>
  artifact.toSnapshot().qualityFlags.includes('no_signal') ? 'NO_SIGNAL' : 'COMPLETED';

export const serializeSummaryArtifact = (artifact: SummaryArtifact): Readonly<Record<string, unknown>> => {
  const snapshot = artifact.toSnapshot();

  return {
    ...snapshot,
    sourceWindow: {
      ...snapshot.sourceWindow,
      startedAt: snapshot.sourceWindow.startedAt.toISOString(),
      endedAt: snapshot.sourceWindow.endedAt.toISOString(),
    },
  };
};

export const summaryQualitySignalsToPrisma = (artifact: SummaryArtifact): Readonly<Record<string, unknown>> => {
  const snapshot = artifact.toSnapshot();

  return {
    qualityFlags: snapshot.qualityFlags,
    confidence: snapshot.confidence,
    usage: snapshot.usage,
  };
};

export const encodeSummaryCursor = (offset: number): string =>
  Buffer.from(JSON.stringify({ offset })).toString('base64url');

export const parseSummaryCursor = (cursor: string | undefined): number => {
  if (cursor === undefined) {
    return 0;
  }

  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { offset?: unknown };

    if (typeof parsed.offset === 'number' && Number.isInteger(parsed.offset) && parsed.offset >= 0) {
      return parsed.offset;
    }
  } catch {
    return 0;
  }

  return 0;
};

const summaryJobStatusFromPrisma = (status: PrismaSummaryStatus): SummaryJobStatus => {
  if (status === 'REQUESTED') {
    return 'requested';
  }

  if (status === 'RUNNING') {
    return 'running';
  }

  if (status === 'COMPLETED') {
    return 'completed';
  }

  if (status === 'NO_SIGNAL') {
    return 'no_signal';
  }

  if (status === 'FAILED') {
    return 'failed';
  }

  throw new Error(`Cannot rehydrate unsupported summary job status "${status}"`);
};

const normalizeArtifactPayload = (
  payload: unknown,
  fallback: PrismaSummaryArtifactRecord,
): SummaryArtifactProps => {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Summary artifact payload must be an object');
  }

  const value = payload as SerializedSummaryArtifactPayload;
  const sourceWindow = value.sourceWindow;

  if (
    sourceWindow === undefined ||
    sourceWindow === null ||
    typeof sourceWindow !== 'object' ||
    Array.isArray(sourceWindow)
  ) {
    throw new Error('Summary artifact source window payload is invalid');
  }
  const serializedSourceWindow = sourceWindow as SerializedSummarySourceWindow;

  return {
    schemaVersion: requireStringLiteral(value.schemaVersion, 'summary.artifact.v1', 'Summary schema version'),
    summaryId: fallback.id,
    tenantId: tenantId(fallback.tenantId),
    workspaceId: workspaceId(fallback.workspaceId),
    topicId: fallback.topicId,
    sourceWindow: {
      windowId: requireString(serializedSourceWindow.windowId, 'Summary source window id'),
      startedAt: requireDate(serializedSourceWindow.startedAt, 'Summary source window start'),
      endedAt: requireDate(serializedSourceWindow.endedAt, 'Summary source window end'),
      selectedFeedItemIds: requireStringArray(
        serializedSourceWindow.selectedFeedItemIds,
        'Summary source window selected feed ids',
      ),
    },
    headline: requireString(value.headline ?? fallback.headline, 'Summary headline'),
    executiveSummary: requireString(value.executiveSummary ?? fallback.summaryText ?? '', 'Summary text'),
    keyPoints: requireArray<SummaryKeyPoint>(value.keyPoints, 'Summary key points'),
    risksAndUnknowns: requireArray<SummaryRisk>(value.risksAndUnknowns, 'Summary risks'),
    sourceHighlights: requireStringArray(value.sourceHighlights, 'Summary source highlights'),
    citationMap: requireArray<SummaryCitation>(value.citationMap, 'Summary citation map'),
    qualityFlags: requireArray<SummaryQualityFlag>(value.qualityFlags, 'Summary quality flags'),
    confidence: requireObject<SummaryConfidence>(value.confidence, 'Summary confidence'),
    lineage: requireObject<SummaryLineage>(value.lineage, 'Summary lineage'),
    usage: requireObject<SummaryUsage>(value.usage, 'Summary usage'),
    noSignalReason: normalizeOptionalString(value.noSignalReason),
  };
};

const normalizeFeedbackCategory = (value: string): SummaryFeedbackCategory => {
  if (!isSummaryFeedbackCategory(value)) {
    throw new Error(`Unsupported summary feedback category "${value}"`);
  }

  return value;
};

const normalizeTriageOwner = (value: string): SummaryFeedbackTriageOwner => {
  if (!summaryFeedbackTriageOwners.includes(value as SummaryFeedbackTriageOwner)) {
    throw new Error(`Unsupported summary feedback triage owner "${value}"`);
  }

  return value as SummaryFeedbackTriageOwner;
};

const normalizeFeedbackEvidence = (
  value: unknown,
  summaryId: string,
  topicId: string,
): SummaryFeedbackEvidence => {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return {
      summaryId,
      topicId,
      citationId: normalizeOptionalString((value as { readonly citationId?: unknown }).citationId),
      feedItemId: normalizeOptionalString((value as { readonly feedItemId?: unknown }).feedItemId),
      sourceItemId: normalizeOptionalString((value as { readonly sourceItemId?: unknown }).sourceItemId),
    };
  }

  return { summaryId, topicId };
};

const normalizeOptionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value : undefined;

const summaryFeedbackTriageOwners: readonly SummaryFeedbackTriageOwner[] = [
  'product-owner',
  'source-owner',
  'summary-owner',
  'support-owner',
];

type SerializedSummarySourceWindow = {
  readonly windowId?: unknown;
  readonly startedAt?: unknown;
  readonly endedAt?: unknown;
  readonly selectedFeedItemIds?: unknown;
};

type SerializedSummaryArtifactPayload = {
  readonly schemaVersion?: unknown;
  readonly sourceWindow?: SerializedSummarySourceWindow | unknown;
  readonly headline?: unknown;
  readonly executiveSummary?: unknown;
  readonly keyPoints?: unknown;
  readonly risksAndUnknowns?: unknown;
  readonly sourceHighlights?: unknown;
  readonly citationMap?: unknown;
  readonly qualityFlags?: unknown;
  readonly confidence?: unknown;
  readonly lineage?: unknown;
  readonly usage?: unknown;
  readonly noSignalReason?: unknown;
};

const requireStringLiteral = <T extends string>(value: unknown, expected: T, fieldName: string): T => {
  if (value !== expected) {
    throw new Error(`${fieldName} must be ${expected}`);
  }

  return expected;
};

const requireString = (value: unknown, fieldName: string): string => {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string`);
  }

  return value;
};

const requireDate = (value: unknown, fieldName: string): Date => {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be an ISO date string`);
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldName} must be a valid ISO date`);
  }

  return parsed;
};

const requireStringArray = (value: unknown, fieldName: string): readonly string[] => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${fieldName} must be a string array`);
  }

  return value;
};

const requireArray = <T>(value: unknown, fieldName: string): readonly T[] => {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }

  return value as readonly T[];
};

const requireObject = <T>(value: unknown, fieldName: string): T => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object`);
  }

  return value as T;
};
