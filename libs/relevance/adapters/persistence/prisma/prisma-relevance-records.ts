import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import {
  RelevanceFeedbackSignal,
  RelevanceMemoryProjection,
  type RelevanceMemoryProjectionProps,
  type RelevanceMemoryProjectionStatus,
  type RelevanceFeedbackAction,
  type RelevanceFeedbackReason,
  type RelevanceFeedbackSignalProps,
  type RelevanceFeedbackTarget,
  type RelevanceWeight,
  UserRelevanceProfile,
  type UserRelevanceProfileProps,
} from '../../../domain';

export type PrismaUserRelevanceProfileRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly userId: string;
  readonly interestWeights: unknown;
  readonly sourceWeights: unknown;
  readonly keywordWeights: unknown;
  readonly mutedKeywords: readonly string[];
  readonly blockedProviderKeys: readonly string[];
  readonly rulesVersion: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type PrismaRelevanceFeedbackSignalRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly userId: string;
  readonly idempotencyKey: string;
  readonly action: string;
  readonly rating: number | null;
  readonly target: unknown;
  readonly createdAt: Date;
};

export type PrismaRelevanceMemoryProjectionRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly feedbackId: string;
  readonly userId: string;
  readonly idempotencyKey: string;
  readonly action: string;
  readonly rating: number | null;
  readonly target: unknown;
  readonly learningDirection: string;
  readonly status: string;
  readonly retryCount: number;
  readonly nextAttemptAt: Date;
  readonly projectedAt: Date | null;
  readonly lastError: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export const userRelevanceProfileFromPrisma = (
  record: PrismaUserRelevanceProfileRecord,
): UserRelevanceProfile =>
  UserRelevanceProfile.rehydrate({
    id: record.id,
    tenantId: tenantId(record.tenantId),
    workspaceId: workspaceId(record.workspaceId),
    userId: record.userId,
    interestWeights: normalizeWeights(record.interestWeights),
    sourceWeights: normalizeWeights(record.sourceWeights),
    keywordWeights: normalizeWeights(record.keywordWeights),
    mutedKeywords: record.mutedKeywords,
    blockedProviderKeys: record.blockedProviderKeys,
    rulesVersion: record.rulesVersion,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  } satisfies UserRelevanceProfileProps);

export const relevanceFeedbackSignalFromPrisma = (
  record: PrismaRelevanceFeedbackSignalRecord,
): RelevanceFeedbackSignal =>
  RelevanceFeedbackSignal.rehydrate({
    id: record.id,
    tenantId: tenantId(record.tenantId),
    workspaceId: workspaceId(record.workspaceId),
    userId: record.userId,
    idempotencyKey: record.idempotencyKey,
    action: normalizeAction(record.action),
    rating: record.rating ?? undefined,
    target: normalizeTarget(record.target),
    createdAt: record.createdAt,
  } satisfies RelevanceFeedbackSignalProps);

export const relevanceMemoryProjectionFromPrisma = (
  record: PrismaRelevanceMemoryProjectionRecord,
): RelevanceMemoryProjection =>
  RelevanceMemoryProjection.rehydrate({
    id: record.id,
    tenantId: tenantId(record.tenantId),
    workspaceId: workspaceId(record.workspaceId),
    feedbackId: record.feedbackId,
    userId: record.userId,
    idempotencyKey: record.idempotencyKey,
    action: normalizeAction(record.action),
    rating: record.rating ?? undefined,
    target: normalizeTarget(record.target),
    learningDirection: normalizeLearningDirection(record.learningDirection),
    status: normalizeProjectionStatus(record.status),
    retryCount: record.retryCount,
    nextAttemptAt: record.nextAttemptAt,
    projectedAt: record.projectedAt ?? undefined,
    lastError: record.lastError ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  } satisfies RelevanceMemoryProjectionProps);

const normalizeWeights = (value: unknown): readonly RelevanceWeight[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item !== 'object' || item === null) {
        return null;
      }

      const record = item as { readonly key?: unknown; readonly weight?: unknown };

      return typeof record.key === 'string' && typeof record.weight === 'number'
        ? { key: record.key, weight: record.weight }
        : null;
    })
    .filter((item): item is RelevanceWeight => item !== null);
};

const normalizeAction = (value: string): RelevanceFeedbackAction => {
  if (
    value === 'more_like_this' ||
    value === 'less_like_this' ||
    value === 'hide_source' ||
    value === 'dismiss' ||
    value === 'save'
  ) {
    return value;
  }

  throw new Error(`Unsupported relevance feedback action "${value}"`);
};

const normalizeProjectionStatus = (value: string): RelevanceMemoryProjectionStatus => {
  if (value === 'pending' || value === 'projected' || value === 'failed') {
    return value;
  }

  throw new Error(`Unsupported relevance memory projection status "${value}"`);
};

const normalizeLearningDirection = (value: string): RelevanceMemoryProjectionProps['learningDirection'] => {
  if (value === 'positive' || value === 'negative' || value === 'block_provider') {
    return value;
  }

  throw new Error(`Unsupported relevance memory learning direction "${value}"`);
};

const normalizeTarget = (value: unknown): RelevanceFeedbackTarget => {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Relevance feedback target must be an object');
  }

  const record = value as Record<string, unknown>;

  return {
    feedItemId: optionalString(record.feedItemId),
    interestId: requiredString(record.interestId, 'interestId'),
    providerKey: requiredString(record.providerKey, 'providerKey'),
    title: requiredString(record.title, 'title'),
    bodyPreview: optionalString(record.bodyPreview),
    canonicalUrl: optionalString(record.canonicalUrl),
    feedbackReason: optionalFeedbackReason(record.feedbackReason),
  };
};

const requiredString = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Relevance feedback target ${label} must be non-empty`);
  }

  return value;
};

const optionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value : undefined;

const optionalFeedbackReason = (value: unknown): RelevanceFeedbackReason | undefined => {
  if (
    value === 'not_same_story' ||
    value === 'duplicate' ||
    value === 'low_quality_source' ||
    value === 'overrated_provider'
  ) {
    return value;
  }

  return undefined;
};
