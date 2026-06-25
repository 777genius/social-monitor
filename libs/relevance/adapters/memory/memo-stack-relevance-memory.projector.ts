import { createHash } from 'node:crypto';

import {
  InfinityContextClient,
  type SourceRef,
} from '@infinity-context/sdk';
import { redactSensitiveText } from '@social-monitor/shared-kernel';

import type { RelevanceMemoryProjection } from '../../domain';
import type {
  RelevanceMemoryProjectionResult,
  RelevanceMemoryProjectorPort,
} from '../../ports';

export type MemoStackRelevanceRecordFeedbackRequest =
  Parameters<InfinityContextClient['workflows']['recordFeedback']>[0];
type MemoStackRelevanceMemoryClient = {
  readonly workflows: {
    recordFeedback(request: MemoStackRelevanceRecordFeedbackRequest): Promise<unknown>;
  };
};

export type MemoStackRelevanceMemoryProjectorOptions = {
  readonly baseUrl: string;
  readonly token: string;
  readonly timeoutMs?: number;
  readonly client?: MemoStackRelevanceMemoryClient;
};

const defaultTimeoutMs = 30_000;
const maxWorkflowIdempotencyKeyLength = 115;
const maxSourceIdLength = 160;

type RankingFeedbackKind =
  | 'positive_relevance'
  | 'provider_overranked'
  | 'low_quality_source'
  | 'possible_false_merge'
  | 'possible_duplicate_missed';

type RankingFeedbackSignal = {
  readonly kind: RankingFeedbackKind;
  readonly guidance: string;
  readonly tags: readonly string[];
};

export class MemoStackRelevanceMemoryProjector implements RelevanceMemoryProjectorPort {
  private readonly client: MemoStackRelevanceMemoryClient;

  constructor(options: MemoStackRelevanceMemoryProjectorOptions) {
    const baseUrl = normalizeBaseUrl(options.baseUrl);
    const token = options.token.trim();

    if (baseUrl.length === 0) throw new Error('Memo-stack relevance memory baseUrl must be non-empty');
    if (token.length === 0) throw new Error('Memo-stack relevance memory token must be non-empty');

    this.client = options.client ?? new InfinityContextClient({
      baseUrl,
      token,
      timeoutMs: positiveIntegerOrFallback(options.timeoutMs, defaultTimeoutMs),
    });
  }

  async recordRelevanceFeedback(projection: RelevanceMemoryProjection): Promise<RelevanceMemoryProjectionResult> {
    const snapshot = projection.toSnapshot();
    const rankingFeedback = rankingFeedbackSignal(projection);
    const text = relevanceMemoryText(projection);
    if (text.length === 0) {
      return {
        status: 'skipped',
        diagnostics: { reason: 'empty_relevance_feedback_memory' },
      };
    }

    const scope = userPreferenceScope(snapshot.userId);
    const response = await this.client.workflows.recordFeedback({
      spaceSlug: spaceSlug(snapshot.tenantId, snapshot.workspaceId),
      memoryScopeExternalRef: scope,
      sourceAgent: 'social-monitor.relevance-feedback',
      text,
      idempotencyKey: boundedIdempotencyKey(
        'social-monitor',
        'relevance-feedback',
        snapshot.tenantId,
        snapshot.workspaceId,
        snapshot.feedbackId,
      ),
      sourceId: snapshot.feedbackId,
      sourceRefs: relevanceSourceRefs(projection),
      eventType: 'social-monitor.relevance_feedback.recorded',
      actorRole: 'user',
      sourceActorExternalRef: snapshot.userId,
      occurredAt: snapshot.createdAt.toISOString(),
      metadata: {
        feedback_id: snapshot.feedbackId,
        user_id: snapshot.userId,
        topic_id: snapshot.target.topicId,
        provider_key: snapshot.target.providerKey,
        action: snapshot.action,
        rating: snapshot.rating,
        learning_direction: snapshot.learningDirection,
        feedback_reason: snapshot.target.feedbackReason,
        ranking_feedback_kind: rankingFeedback.kind,
        ranking_feedback_strength: 'explicit_reader_action',
        memory_scope_external_ref: scope,
      },
      rememberAsFact: true,
      factText: text,
      factKind: 'user_preference',
      factCategory: 'user_preferences',
      factTags: relevanceTags(projection, rankingFeedback),
      factTtlPolicy: 'durable',
      factMemoryScopeExternalRef: scope,
    });

    return {
      status: 'written',
      diagnostics: {
        provider: 'memo-stack',
        workflow: 'recordFeedback',
        memoryScopeExternalRef: scope,
        captureId: nestedString(nestedValue(response, ['capture']), ['data', 'id']),
        factId: nestedString(nestedValue(response, ['fact']), ['data', 'id']),
      },
    };
  }
}

export const resolveMemoStackRelevanceMemoryProjectorOptions = (
  env: NodeJS.ProcessEnv,
): MemoStackRelevanceMemoryProjectorOptions => ({
  baseUrl: env.INFINITY_CONTEXT_URL ?? '',
  token: env.INFINITY_CONTEXT_TOKEN ?? '',
  timeoutMs: parsePositiveInteger(env.RELEVANCE_MEMORY_TIMEOUT_MS ?? env.SUMMARY_MEMORY_TIMEOUT_MS),
});

const relevanceMemoryText = (projection: RelevanceMemoryProjection): string => {
  const snapshot = projection.toSnapshot();
  const rankingFeedback = rankingFeedbackSignal(projection);

  return redactSensitiveText([
    `User relevance feedback for topic ${snapshot.target.topicId}: ${snapshot.action} produced ${snapshot.learningDirection} learning.`,
    `Guidance: ${guidanceFor(projection)}.`,
    `Ranking quality signal: ${rankingFeedback.kind}. ${rankingFeedback.guidance}.`,
    `Provider ${snapshot.target.providerKey} was involved.`,
    `Item title: ${snapshot.target.title}.`,
    snapshot.target.bodyPreview === undefined ? '' : `Item context: ${snapshot.target.bodyPreview}.`,
  ].filter((line) => line.length > 0).join(' '));
};

const guidanceFor = (projection: RelevanceMemoryProjection): string => {
  const snapshot = projection.toSnapshot();
  if (snapshot.learningDirection === 'block_provider') {
    return `avoid ${snapshot.target.providerKey} evidence for this user unless explicitly requested`;
  }
  if (snapshot.learningDirection === 'positive') {
    return `prefer similar ${snapshot.target.providerKey} evidence and topic signals for this user`;
  }

  return `down-rank similar ${snapshot.target.providerKey} evidence and weakly related topic signals for this user`;
};

const rankingFeedbackSignal = (projection: RelevanceMemoryProjection): RankingFeedbackSignal => {
  const snapshot = projection.toSnapshot();
  const text = `${snapshot.target.title} ${snapshot.target.bodyPreview ?? ''}`.toLocaleLowerCase('en-US');

  switch (snapshot.target.feedbackReason) {
    case 'not_same_story':
      return {
        kind: 'possible_false_merge',
        guidance: 'use this as an explicit eval candidate for over-merged stories',
        tags: ['ranking-feedback', 'ranking-feedback-false-merge'],
      };
    case 'duplicate':
      return {
        kind: 'possible_duplicate_missed',
        guidance: 'use this as an explicit eval candidate for stories that should have been deduplicated',
        tags: ['ranking-feedback', 'ranking-feedback-duplicate-missed'],
      };
    case 'low_quality_source':
      return {
        kind: 'low_quality_source',
        guidance: `treat ${snapshot.target.providerKey} as a low-quality source for this user/topic until stronger evidence appears`,
        tags: ['ranking-feedback', 'ranking-feedback-low-quality-source'],
      };
    case 'overrated_provider':
      return {
        kind: 'provider_overranked',
        guidance: `down-rank similar ${snapshot.target.providerKey} evidence as an explicit provider-overranked signal`,
        tags: ['ranking-feedback', 'ranking-feedback-provider-overranked'],
      };
    case undefined:
      break;
  }

  if (snapshot.learningDirection === 'block_provider') {
    return {
      kind: 'low_quality_source',
      guidance: `treat ${snapshot.target.providerKey} as a low-quality source for this user/topic until stronger evidence appears`,
      tags: ['ranking-feedback', 'ranking-feedback-low-quality-source'],
    };
  }

  if (snapshot.learningDirection === 'positive') {
    return {
      kind: 'positive_relevance',
      guidance: 'prefer similar story signals as weak positive ranking feedback',
      tags: ['ranking-feedback', 'ranking-feedback-positive-relevance'],
    };
  }

  if (containsAny(text, ['false merge', 'wrongly merged', 'not the same story', 'unrelated story'])) {
    return {
      kind: 'possible_false_merge',
      guidance: 'use this as a weak eval candidate for over-merged stories',
      tags: ['ranking-feedback', 'ranking-feedback-false-merge'],
    };
  }

  if (containsAny(text, ['duplicate missed', 'same story duplicated', 'split story', 'already covered'])) {
    return {
      kind: 'possible_duplicate_missed',
      guidance: 'use this as a weak eval candidate for stories that should have been deduplicated',
      tags: ['ranking-feedback', 'ranking-feedback-duplicate-missed'],
    };
  }

  return {
    kind: 'provider_overranked',
    guidance: `down-rank similar ${snapshot.target.providerKey} evidence as a weak provider-overranked signal`,
    tags: ['ranking-feedback', 'ranking-feedback-provider-overranked'],
  };
};

const containsAny = (value: string, needles: readonly string[]): boolean =>
  needles.some((needle) => value.includes(needle));

const relevanceTags = (
  projection: RelevanceMemoryProjection,
  rankingFeedback: RankingFeedbackSignal,
): readonly string[] => {
  const snapshot = projection.toSnapshot();

  return [
    'relevance-feedback',
    ...rankingFeedback.tags,
    `direction-${snapshot.learningDirection}`,
    `action-${snapshot.action}`,
    `provider-${snapshot.target.providerKey}`,
    `topic-${snapshot.target.topicId}`,
  ];
};

const relevanceSourceRefs = (
  projection: RelevanceMemoryProjection,
): readonly SourceRef[] => {
  const snapshot = projection.toSnapshot();
  const refs = [
    sourceRef('social-monitor.relevance-feedback', snapshot.feedbackId),
    sourceRef('social-monitor.feed-item', snapshot.target.feedItemId),
  ];

  return refs.filter((ref): ref is SourceRef => ref !== undefined);
};

const sourceRef = (sourceType: string, sourceId: string | undefined): SourceRef | undefined =>
  sourceId === undefined || sourceId.trim().length === 0
    ? undefined
    : {
        source_type: sourceType,
        source_id: boundedText(sourceId.trim(), maxSourceIdLength),
      };

const spaceSlug = (tenantId: string, workspaceId: string): string =>
  `social-monitor:${tenantId}:${workspaceId}`;

const userPreferenceScope = (userId: string): string => `user:${userId}:preferences`;

const boundedIdempotencyKey = (...parts: readonly string[]): string => {
  const raw = parts.join(':');

  return boundedText(raw, maxWorkflowIdempotencyKeyLength);
};

const boundedText = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) {
    return value;
  }

  const digest = createHash('sha256').update(value).digest('hex').slice(0, 32);
  const prefix = value.slice(0, maxLength - digest.length - 1).replace(/:+$/u, '');

  return `${prefix}:${digest}`;
};

const normalizeBaseUrl = (value: string): string => value.trim().replace(/\/+$/u, '');

const positiveIntegerOrFallback = (value: number | undefined, fallback: number): number =>
  value !== undefined && Number.isInteger(value) && value > 0 ? value : fallback;

const parsePositiveInteger = (value: string | undefined): number | undefined => {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

const nestedString = (value: unknown, path: readonly string[]): string | undefined => {
  let current = value;
  for (const key of path) {
    if (current === null || typeof current !== 'object' || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return typeof current === 'string' ? current : undefined;
};

const nestedValue = (value: unknown, path: readonly string[]): unknown => {
  let current = value;
  for (const key of path) {
    if (current === null || typeof current !== 'object' || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return current;
};
