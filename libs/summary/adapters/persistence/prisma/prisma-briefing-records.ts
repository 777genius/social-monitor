import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import {
  BriefingArtifact,
  type BriefingArtifactProps,
  type BriefingCitation,
  type BriefingConfidence,
  type BriefingContextArtifact,
  type BriefingDedupeStrategy,
  BriefingJob,
  type BriefingJobProps,
  type BriefingJobStatus,
  type BriefingLineage,
  BriefingPolicy,
  type BriefingPolicyFormat,
  type BriefingPolicyLanguage,
  type BriefingPolicyProps,
  type BriefingPolicyTone,
  type BriefingQualityFlag,
  type BriefingRepeatedSignal,
  type BriefingRisk,
  type BriefingScope,
  briefingScopeKey,
  type BriefingTopicHighlight,
  type BriefingTopStory,
  type BriefingUsage,
  type StoryCluster,
} from '../../../domain';
import type { PrismaSummaryStatus } from './prisma-summary-records';

export type PrismaBriefingJobRecord = {
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
  readonly briefingArtifactId: string | null;
  readonly failureReason: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type PrismaBriefingArtifactRecord = {
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

export type PrismaBriefingPolicyRecord = {
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

export const briefingJobFromPrisma = (record: PrismaBriefingJobRecord): BriefingJob =>
  BriefingJob.rehydrate({
    id: record.id,
    tenantId: tenantId(record.tenantId),
    workspaceId: workspaceId(record.workspaceId),
    scope: briefingScopeFromPrisma(record),
    userId: record.userId ?? undefined,
    subscriptionId: record.subscriptionId ?? undefined,
    status: briefingJobStatusFromPrisma(record.status),
    idempotencyKey: record.idempotencyKey,
    requestedAt: record.requestedAt,
    startedAt: record.startedAt ?? undefined,
    completedAt: record.completedAt ?? undefined,
    failedAt: record.failedAt ?? undefined,
    briefingId: record.briefingArtifactId ?? undefined,
    failureReason: record.failureReason ?? undefined,
  } satisfies BriefingJobProps);

export const briefingArtifactFromPrisma = (record: PrismaBriefingArtifactRecord): BriefingArtifact =>
  BriefingArtifact.rehydrate(normalizeBriefingArtifactPayload(record.artifactPayload, record));

export const briefingPolicyFromPrisma = (record: PrismaBriefingPolicyRecord): BriefingPolicy =>
  BriefingPolicy.rehydrate({
    id: record.id,
    tenantId: tenantId(record.tenantId),
    workspaceId: workspaceId(record.workspaceId),
    scope: briefingScopeFromPrisma(record),
    language: normalizeBriefingPolicyLanguage(record.language),
    format: normalizeBriefingPolicyFormat(record.format),
    tone: normalizeBriefingPolicyTone(record.tone),
    maxStories: record.maxStories,
    includeRisks: record.includeRisks,
    includeTopicHighlights: record.includeTopicHighlights,
    includeRepeatedSignals: record.includeRepeatedSignals,
    dedupeStrategy: normalizeBriefingDedupeStrategy(record.dedupeStrategy),
    customInstructions: record.customInstructions ?? undefined,
    rulesVersion: record.rulesVersion,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  } satisfies BriefingPolicyProps);

export const briefingJobStatusToPrisma = (status: BriefingJobStatus): PrismaSummaryStatus => {
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

export const briefingArtifactStatusToPrisma = (artifact: BriefingArtifact): PrismaSummaryStatus =>
  artifact.toSnapshot().qualityFlags.includes('no_signal') ? 'NO_SIGNAL' : 'COMPLETED';

export const serializeBriefingArtifact = (artifact: BriefingArtifact): Readonly<Record<string, unknown>> => {
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

export const briefingQualitySignalsToPrisma = (artifact: BriefingArtifact): Readonly<Record<string, unknown>> => {
  const snapshot = artifact.toSnapshot();

  return {
    qualityFlags: snapshot.qualityFlags,
    confidence: snapshot.confidence,
    usage: snapshot.usage,
  };
};

export const briefingScopeToPrisma = (scope: BriefingScope): {
  readonly scopeType: string;
  readonly scopeKey: string;
  readonly topicId: string | null;
} => ({
  scopeType: scope.type,
  scopeKey: briefingScopeKey(scope),
  topicId: scope.type === 'topic' ? scope.topicId : null,
});

const briefingJobStatusFromPrisma = (status: PrismaSummaryStatus): BriefingJobStatus => {
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

  throw new Error(`Cannot rehydrate unsupported briefing job status "${status}"`);
};

const briefingScopeFromPrisma = (record: {
  readonly scopeType: string;
  readonly topicId: string | null;
}): BriefingScope => {
  if (record.scopeType === 'workspace') {
    return { type: 'workspace' };
  }

  if (record.scopeType === 'topic' && record.topicId !== null) {
    return { type: 'topic', topicId: record.topicId };
  }

  throw new Error(`Unsupported briefing scope "${record.scopeType}"`);
};

const normalizeBriefingArtifactPayload = (
  payload: unknown,
  fallback: PrismaBriefingArtifactRecord,
): BriefingArtifactProps => {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Briefing artifact payload must be an object');
  }

  const value = payload as SerializedBriefingArtifactPayload;
  const sourceWindow = value.sourceWindow;

  if (
    sourceWindow === undefined ||
    sourceWindow === null ||
    typeof sourceWindow !== 'object' ||
    Array.isArray(sourceWindow)
  ) {
    throw new Error('Briefing artifact source window payload is invalid');
  }
  const serializedSourceWindow = sourceWindow as SerializedBriefingSourceWindow;

  return {
    schemaVersion: requireStringLiteral(value.schemaVersion, 'briefing.artifact.v1', 'Briefing schema version'),
    briefingId: fallback.id,
    tenantId: tenantId(fallback.tenantId),
    workspaceId: workspaceId(fallback.workspaceId),
    scope: briefingScopeFromPrisma(fallback),
    userId: normalizeOptionalString(value.userId) ?? fallback.userId ?? undefined,
    subscriptionId: normalizeOptionalString(value.subscriptionId) ?? fallback.subscriptionId ?? undefined,
    sourceWindow: {
      windowId: requireString(serializedSourceWindow.windowId, 'Briefing source window id'),
      startedAt: requireDate(serializedSourceWindow.startedAt, 'Briefing source window start'),
      endedAt: requireDate(serializedSourceWindow.endedAt, 'Briefing source window end'),
      selectedFeedItemIds: requireStringArray(
        serializedSourceWindow.selectedFeedItemIds,
        'Briefing source window selected feed ids',
      ),
      storyClusterIds: requireStringArray(
        serializedSourceWindow.storyClusterIds,
        'Briefing source window story cluster ids',
      ),
    },
    storyClusters: requireArray<SerializedBriefingStoryCluster>(
      value.storyClusters,
      'Briefing story clusters',
    ).map(normalizeBriefingStoryCluster),
    contextArtifacts: requireArray<SerializedBriefingContextArtifact>(
      value.contextArtifacts,
      'Briefing context artifacts',
    ).map(normalizeBriefingContextArtifact),
    headline: requireString(value.headline ?? fallback.headline, 'Briefing headline'),
    executiveSummary: requireString(value.executiveSummary ?? fallback.summaryText ?? '', 'Briefing text'),
    topStories: requireArray<BriefingTopStory>(value.topStories, 'Briefing top stories'),
    topicHighlights: requireArray<BriefingTopicHighlight>(value.topicHighlights, 'Briefing topic highlights'),
    repeatedSignals: requireArray<BriefingRepeatedSignal>(value.repeatedSignals, 'Briefing repeated signals'),
    risksAndUnknowns: requireArray<BriefingRisk>(value.risksAndUnknowns, 'Briefing risks'),
    citationMap: requireArray<BriefingCitation>(value.citationMap, 'Briefing citation map'),
    qualityFlags: requireArray<BriefingQualityFlag>(value.qualityFlags, 'Briefing quality flags'),
    confidence: requireObject<BriefingConfidence>(value.confidence, 'Briefing confidence'),
    lineage: requireObject<BriefingLineage>(value.lineage, 'Briefing lineage'),
    usage: requireObject<BriefingUsage>(value.usage, 'Briefing usage'),
    noSignalReason: normalizeOptionalString(value.noSignalReason),
  };
};

const normalizeBriefingPolicyLanguage = (value: string): BriefingPolicyLanguage => {
  if (value === 'auto' || value === 'en' || value === 'ru') {
    return value;
  }

  throw new Error(`Unsupported briefing policy language "${value}"`);
};

const normalizeBriefingPolicyFormat = (value: string): BriefingPolicyFormat => {
  if (value === 'executive_brief' || value === 'bullet_digest' || value === 'risk_brief') {
    return value;
  }

  throw new Error(`Unsupported briefing policy format "${value}"`);
};

const normalizeBriefingPolicyTone = (value: string): BriefingPolicyTone => {
  if (value === 'neutral' || value === 'concise' || value === 'analytical') {
    return value;
  }

  throw new Error(`Unsupported briefing policy tone "${value}"`);
};

const normalizeBriefingDedupeStrategy = (value: string): BriefingDedupeStrategy => {
  if (value === 'canonical_url_then_title') {
    return value;
  }

  throw new Error(`Unsupported briefing dedupe strategy "${value}"`);
};

const normalizeBriefingStoryCluster = (value: SerializedBriefingStoryCluster): StoryCluster => ({
  ...requireObject<Omit<StoryCluster, 'observedAtRange'>>(value, 'Briefing story cluster'),
  observedAtRange: {
    startedAt: requireDate(value.observedAtRange?.startedAt, 'Briefing story cluster start'),
    endedAt: requireDate(value.observedAtRange?.endedAt, 'Briefing story cluster end'),
  },
});

const normalizeBriefingContextArtifact = (
  value: SerializedBriefingContextArtifact,
): BriefingContextArtifact => ({
  ...requireObject<Omit<BriefingContextArtifact, 'generatedAt'>>(value, 'Briefing context artifact'),
  generatedAt: requireDate(value.generatedAt, 'Briefing context artifact generated date'),
});

const normalizeOptionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value : undefined;

type SerializedBriefingSourceWindow = {
  readonly windowId?: unknown;
  readonly startedAt?: unknown;
  readonly endedAt?: unknown;
  readonly selectedFeedItemIds?: unknown;
  readonly storyClusterIds?: unknown;
};

type SerializedBriefingStoryCluster = Omit<StoryCluster, 'observedAtRange'> & {
  readonly observedAtRange?: {
    readonly startedAt?: unknown;
    readonly endedAt?: unknown;
  };
};

type SerializedBriefingContextArtifact = Omit<BriefingContextArtifact, 'generatedAt'> & {
  readonly generatedAt?: unknown;
};

type SerializedBriefingArtifactPayload = {
  readonly schemaVersion?: unknown;
  readonly userId?: unknown;
  readonly subscriptionId?: unknown;
  readonly sourceWindow?: SerializedBriefingSourceWindow | unknown;
  readonly storyClusters?: unknown;
  readonly contextArtifacts?: unknown;
  readonly headline?: unknown;
  readonly executiveSummary?: unknown;
  readonly topStories?: unknown;
  readonly topicHighlights?: unknown;
  readonly repeatedSignals?: unknown;
  readonly risksAndUnknowns?: unknown;
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
