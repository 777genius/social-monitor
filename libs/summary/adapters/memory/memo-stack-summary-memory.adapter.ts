import {
  InfinityContextClient,
  type ContextBundleData,
  type ContextEnvelope,
  type JsonObject,
  type SourceRef,
} from '@infinity-context/sdk';
import { redactSensitiveText } from '@social-monitor/shared-kernel';

import type {
  BuildSummaryMemoryContextQuery,
  RecordSummaryFeedbackMemoryCommand,
  SummaryMemoryContext,
  SummaryMemoryDiagnostics,
  SummaryMemoryPort,
  SummaryMemoryRetrieval,
  SummaryMemorySourceRef,
  SummaryMemoryStaleMarkers,
  SummaryMemorySupport,
  SummaryMemoryWriteResult,
} from '../../ports';
import {
  createMemoStackMemoryClient,
  defaultMemoStackTimeoutMs,
  memoStackSourceRef,
  memoStackWorkflowIdempotencyKey,
  type MemoStackFetchLike,
  normalizeMemoStackBaseUrl,
  parsePositiveInteger,
  positiveIntegerOrFallback,
} from './memo-stack-memory-client';
import {
  feedbackMemoryMapping,
  feedbackMemoryText,
  feedbackTags,
  providerQualitySignal,
  providerQualityTags,
} from './memo-stack-summary-feedback-memory';
import { mergeFallbackContexts } from './memo-stack-summary-memory-context-merge';

type MemoStackSummaryMemoryClient = Pick<InfinityContextClient, 'context' | 'workflows'>;

export type MemoStackSummaryMemoryAdapterOptions = {
  readonly baseUrl: string;
  readonly token: string;
  readonly timeoutMs?: number;
  readonly fetchFn?: MemoStackFetchLike;
  readonly client?: MemoStackSummaryMemoryClient;
};

const contextTokenBudget = 900;
const maxMemoryFacts = 12;
const maxMemoryChunks = 8;

export class MemoStackSummaryMemoryAdapter implements SummaryMemoryPort {
  private readonly client: MemoStackSummaryMemoryClient;

  constructor(options: MemoStackSummaryMemoryAdapterOptions) {
    const baseUrl = normalizeMemoStackBaseUrl(options.baseUrl);
    const token = options.token.trim();
    const timeoutMs = positiveIntegerOrFallback(options.timeoutMs, defaultMemoStackTimeoutMs);

    if (baseUrl.length === 0) throw new Error('Memo-stack summary memory baseUrl must be non-empty');
    if (token.length === 0) throw new Error('Memo-stack summary memory token must be non-empty');

    this.client = options.client ?? createMemoStackMemoryClient({
      baseUrl,
      token,
      timeoutMs,
      fetchFn: options.fetchFn,
    });
  }

  async buildContext(query: BuildSummaryMemoryContextQuery): Promise<SummaryMemoryContext> {
    const response = await this.client.context.buildContext(this.contextRequest(query));
    const context = presentMemoryContext(response, query.requestedAt);

    if (context.status === 'empty' && context.diagnostics.scope_not_found === true) {
      return this.buildScopeFallbackContext(query);
    }

    return context;
  }

  private async buildScopeFallbackContext(query: BuildSummaryMemoryContextQuery): Promise<SummaryMemoryContext> {
    const scopes = [...providerQualityScopes(query), topicFeedbackScope(query.topicId)];
    const contexts: SummaryMemoryContext[] = [];
    for (const scope of scopes) {
      const response = await this.client.context.buildContext(this.contextRequest(query, {
        memoryScopeExternalRefs: [scope],
      }));
      const context = presentMemoryContext(response, query.requestedAt);
      if (context.status === 'available') {
        contexts.push(context);
      }
    }

    return contexts.length === 0
      ? {
          status: 'empty',
          diagnostics: { fallbackFromScopeNotFound: true, fallbackScopesUsed: [] },
          retrievedAt: query.requestedAt,
        }
      : mergeFallbackContexts(contexts, query.requestedAt);
  }

  async recordSummaryFeedback(command: RecordSummaryFeedbackMemoryCommand): Promise<SummaryMemoryWriteResult> {
    if (command.comment === undefined && command.rating >= 4 && command.category === 'other') {
      return {
        status: 'skipped',
        diagnostics: { reason: 'low_signal_feedback' },
      };
    }

    const idempotencyKey = memoStackWorkflowIdempotencyKey(
      'social-monitor',
      'summary-feedback',
      command.tenantId,
      command.workspaceId,
      command.idempotencyKey,
    );
    const mapping = feedbackMemoryMapping(command.category);
    const providerQuality = providerQualitySignal(command);
    const memoryText = feedbackMemoryText(command, mapping, providerQuality);
    const providerScope = providerQuality === undefined || command.providerKey === undefined
      ? undefined
      : providerQualityScope(command.topicId, command.providerKey);
    const response = await this.client.workflows.recordFeedback({
      spaceSlug: spaceSlug(command.tenantId, command.workspaceId),
      memoryScopeExternalRef: topicFeedbackScope(command.topicId),
      sourceAgent: 'social-monitor.summary-feedback',
      text: memoryText,
      idempotencyKey,
      sourceId: command.feedbackId,
      sourceRefs: feedbackSourceRefs(command),
      eventType: 'social-monitor.summary_feedback.recorded',
      actorRole: 'user',
      sourceActorExternalRef: command.submittedBy,
      occurredAt: command.createdAt.toISOString(),
      metadata: withoutUndefined({
        summary_id: command.summaryId,
        topic_id: command.topicId,
        rating: command.rating,
        category: command.category,
        provider_key: command.providerKey,
        citation_id: command.citationId,
        memory_action: mapping.action,
        memory_fact_category: mapping.factCategory,
        provider_quality_action: providerQuality?.action,
        provider_quality_scope: providerScope,
      }),
      rememberAsFact: true,
      factText: memoryText,
      factKind: mapping.factKind,
      factCategory: mapping.factCategory,
      factTags: feedbackTags(command, mapping),
      factTtlPolicy: 'durable',
      factMemoryScopeExternalRef: topicFeedbackScope(command.topicId),
    });
    const providerQualityResponse = providerQuality === undefined || command.providerKey === undefined
      ? undefined
      : await this.recordProviderQualityFeedback(command, providerQuality, memoryText);

    return {
      status: 'written',
      diagnostics: {
        provider: 'memo-stack',
        workflow: 'recordFeedback',
        captureId: nestedString(response.capture, ['data', 'id']),
        factId: nestedString(response.fact, ['data', 'id']),
        memoryScopeExternalRef: topicFeedbackScope(command.topicId),
        factMemoryScopeExternalRef: topicFeedbackScope(command.topicId),
        providerQualityCaptureId: nestedString(providerQualityResponse?.capture, ['data', 'id']),
        providerQualityFactId: nestedString(providerQualityResponse?.fact, ['data', 'id']),
        providerQualityScopeExternalRef: providerScope,
      },
    };
  }

  private async recordProviderQualityFeedback(
    command: RecordSummaryFeedbackMemoryCommand,
    providerQuality: NonNullable<ReturnType<typeof providerQualitySignal>>,
    memoryText: string,
  ): Promise<Awaited<ReturnType<MemoStackSummaryMemoryClient['workflows']['recordFeedback']>>> {
    const providerScope = providerQualityScope(command.topicId, command.providerKey ?? 'unknown');

    return this.client.workflows.recordFeedback({
      spaceSlug: spaceSlug(command.tenantId, command.workspaceId),
      memoryScopeExternalRef: providerScope,
      sourceAgent: 'social-monitor.summary-provider-quality',
      text: memoryText,
      idempotencyKey: memoStackWorkflowIdempotencyKey(
        'social-monitor',
        'summary-provider-quality',
        command.tenantId,
        command.workspaceId,
        command.idempotencyKey,
      ),
      sourceId: `${command.feedbackId}:provider-quality`,
      sourceRefs: feedbackSourceRefs(command),
      eventType: 'social-monitor.summary_feedback.provider_quality_recorded',
      actorRole: 'user',
      sourceActorExternalRef: command.submittedBy,
      occurredAt: command.createdAt.toISOString(),
      metadata: withoutUndefined({
        parent_feedback_id: command.feedbackId,
        summary_id: command.summaryId,
        topic_id: command.topicId,
        rating: command.rating,
        category: command.category,
        provider_key: command.providerKey,
        citation_id: command.citationId,
        memory_action: providerQuality.action,
        memory_fact_category: 'provider_quality',
        provider_quality_action: providerQuality.action,
        provider_quality_scope: providerScope,
      }),
      rememberAsFact: true,
      factText: memoryText,
      factKind: 'user_preference',
      factCategory: 'provider_quality',
      factTags: providerQualityTags(command, providerQuality),
      factTtlPolicy: 'durable',
      factMemoryScopeExternalRef: providerScope,
    });
  }

  private contextRequest(
    query: BuildSummaryMemoryContextQuery,
    overrides: { readonly memoryScopeExternalRefs?: readonly string[] } = {},
  ): Parameters<MemoStackSummaryMemoryClient['context']['buildContext']>[0] {
    return {
      spaceSlug: spaceSlug(query.tenantId, query.workspaceId),
      memoryScopeExternalRefs: overrides.memoryScopeExternalRefs ?? readMemoryScopes(query),
      query: contextQuery(query),
      tokenBudget: contextTokenBudget,
      maxFacts: maxMemoryFacts,
      maxChunks: maxMemoryChunks,
      maxEvidenceItems: 5,
      consistencyMode: 'best_effort',
      includeStale: false,
    };
  }
}

export const resolveMemoStackSummaryMemoryOptions = (
  env: NodeJS.ProcessEnv,
): MemoStackSummaryMemoryAdapterOptions => ({
  baseUrl: env.INFINITY_CONTEXT_URL ?? '',
  token: env.INFINITY_CONTEXT_TOKEN ?? '',
  timeoutMs: parsePositiveInteger(env.SUMMARY_MEMORY_TIMEOUT_MS),
});

export const spaceSlug = (tenantId: string, workspaceId: string): string =>
  `social-monitor:${tenantId}:${workspaceId}`;

export const topicFeedbackScope = (topicId: string): string => `topic:${topicId}:feedback`;

export const providerQualityScope = (topicId: string, providerKey: string): string =>
  `topic:${topicId}:provider:${providerKey}:quality`;

export const topicPreferenceScope = (topicId: string): string => `topic:${topicId}:preferences`;

export const userPreferenceScope = (userId: string): string => `user:${userId}:preferences`;

export const subscriptionPreferenceScope = (subscriptionId: string): string =>
  `subscription:${subscriptionId}:preferences`;

export {
  createMemoStackMemoryClient,
  memoStackSourceRef,
  memoStackWorkflowIdempotencyKey,
  type MemoStackFetchLike,
} from './memo-stack-memory-client';

const readMemoryScopes = (query: BuildSummaryMemoryContextQuery): readonly string[] => [
  ...(query.subscriptionId === undefined ? [] : [subscriptionPreferenceScope(query.subscriptionId)]),
  ...(query.userId === undefined ? [] : [userPreferenceScope(query.userId)]),
  topicPreferenceScope(query.topicId),
  'workspace-global',
  ...providerQualityScopes(query),
  topicFeedbackScope(query.topicId),
];

const providerQualityScopes = (query: BuildSummaryMemoryContextQuery): readonly string[] =>
  [...new Set(query.evidence.items
    .map((item) => item.providerKey.trim())
    .filter((providerKey) => providerKey.length > 0)
    .sort((left, right) => left.localeCompare(right))
    .map((providerKey) => providerQualityScope(query.topicId, providerKey)))];

const contextQuery = (query: BuildSummaryMemoryContextQuery): string => {
  const evidenceTitles = query.evidence.items
    .slice(0, 5)
    .map((item) => item.title.trim())
    .filter((title) => title.length > 0)
    .join(' | ');
  const providerDistribution = [...query.evidence.items.reduce<Map<string, number>>(
    (counts, item) => counts.set(item.providerKey, (counts.get(item.providerKey) ?? 0) + 1),
    new Map(),
  ).entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([providerKey, count]) => `${providerKey}=${count}`)
    .join(', ');
  const userPart = query.userId === undefined ? '' : ` user:${query.userId}`;

  return redactSensitiveText([
    `summary guidance topic:${query.topicId}${userPart}`,
    providerDistribution.length === 0 ? '' : `provider distribution: ${providerDistribution}`,
    evidenceTitles.length === 0 ? '' : `evidence: ${evidenceTitles}`,
  ].filter((part) => part.length > 0).join(' '));
};

const presentMemoryContext = (
  response: ContextEnvelope<ContextBundleData>,
  retrievedAt: Date,
): SummaryMemoryContext => {
  const renderedText = stringOrUndefined(response.data?.rendered_text);
  const diagnostics = asDiagnostics(response.data?.diagnostics);

  return {
    status: renderedText === undefined || renderedText.trim().length === 0 ? 'empty' : 'available',
    renderedText,
    sourceRefs: summaryMemorySourceRefs(response.data),
    retrieval: summaryMemoryRetrieval(response.data?.diagnostics),
    staleMarkers: summaryMemoryStaleMarkers(response.data?.diagnostics),
    support: summaryMemorySupport(response.data?.answer_support),
    diagnostics,
    retrievedAt,
  };
};

const summaryMemorySourceRefs = (data: ContextBundleData | undefined): readonly SummaryMemorySourceRef[] | undefined => {
  const refs = new Map<string, SummaryMemorySourceRef>();
  for (const item of data?.items ?? []) {
    addSourceRefs(refs, item.source_refs);
  }
  for (const evidence of data?.top_evidence ?? []) {
    addSourceRefs(refs, evidence.item?.source_refs);
  }

  return refs.size === 0 ? undefined : [...refs.values()];
};

const addSourceRefs = (
  refs: Map<string, SummaryMemorySourceRef>,
  values: readonly SourceRef[] | undefined,
): void => {
  for (const value of values ?? []) {
    const sourceType = typeof value.source_type === 'string' ? value.source_type : 'unknown';
    const sourceId = typeof value.source_id === 'string' ? value.source_id : JSON.stringify(value);
    refs.set(`${sourceType}:${sourceId}`, value as SummaryMemorySourceRef);
  }
};

const summaryMemoryRetrieval = (diagnostics: unknown): SummaryMemoryRetrieval | undefined => {
  const source = asDiagnostics(diagnostics);
  return emptyObjectAsUndefined(withoutUndefined({
    vectorStatus: stringOrUndefined(source.vector_status),
    graphStatus: stringOrUndefined(source.graph_status),
    ragStatus: stringOrUndefined(source.rag_status),
    retrievalSourcesUsed: stringArrayOrUndefined(source.retrieval_sources_used),
    retrievalSourcesTotal: numberOrUndefined(source.retrieval_sources_total),
    retrievalSourcesReturned: numberOrUndefined(source.retrieval_sources_returned),
    itemsConsidered: numberOrUndefined(source.items_considered),
    itemsUsed: numberOrUndefined(source.items_used),
    factsConsidered: numberOrUndefined(source.facts_considered),
    factsUsed: numberOrUndefined(source.facts_used),
    sourceRefsTotal: numberOrUndefined(source.source_refs_total),
    sourceRefsReturned: numberOrUndefined(source.source_refs_returned),
  })) as SummaryMemoryRetrieval | undefined;
};

const summaryMemoryStaleMarkers = (diagnostics: unknown): SummaryMemoryStaleMarkers | undefined => {
  const source = asDiagnostics(diagnostics);
  return emptyObjectAsUndefined(withoutUndefined({
    supersededFactsConsidered: numberOrUndefined(source.superseded_facts_considered),
    supersededFactsUsed: numberOrUndefined(source.superseded_facts_used),
    staleFactsConsidered: numberOrUndefined(source.stale_facts_considered),
    staleFactsUsed: numberOrUndefined(source.stale_facts_used),
    staleVectorDropCount: numberOrUndefined(source.stale_vector_drop_count),
    staleGraphDropCount: numberOrUndefined(source.stale_graph_drop_count),
    staleRagDropCount: numberOrUndefined(source.stale_rag_drop_count),
  })) as SummaryMemoryStaleMarkers | undefined;
};

const summaryMemorySupport = (support: unknown): SummaryMemorySupport | undefined => {
  if (support === null || typeof support !== 'object' || Array.isArray(support)) {
    return undefined;
  }
  const source = support as Record<string, unknown>;
  return emptyObjectAsUndefined(withoutUndefined({
    status: stringOrUndefined(source.status),
    itemsReturned: numberOrUndefined(source.items_returned),
    warnings: stringArrayOrUndefined(source.warnings),
  })) as SummaryMemorySupport | undefined;
};

const feedbackSourceRefs = (command: RecordSummaryFeedbackMemoryCommand): readonly SourceRef[] =>
  compactSourceRefs(
    memoStackSourceRef('social-monitor.summary-feedback', command.feedbackId),
    memoStackSourceRef('social-monitor.summary', command.summaryId),
    memoStackSourceRef('social-monitor.citation', command.citationId),
    memoStackSourceRef('social-monitor.feed-item', command.feedItemId),
    memoStackSourceRef('social-monitor.source-item', command.sourceItemId),
  );

const compactSourceRefs = (...refs: readonly (SourceRef | undefined)[]): readonly SourceRef[] =>
  refs.filter((ref): ref is SourceRef => ref !== undefined);

const stringOrUndefined = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value : undefined;

const numberOrUndefined = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const stringArrayOrUndefined = (value: unknown): readonly string[] | undefined =>
  Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : undefined;

const asDiagnostics = (value: unknown): SummaryMemoryDiagnostics =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as SummaryMemoryDiagnostics
    : {};

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

const withoutUndefined = (value: Record<string, unknown>): JsonObject =>
  Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as JsonObject;

const emptyObjectAsUndefined = (value: JsonObject): JsonObject | undefined =>
  Object.keys(value).length === 0 ? undefined : value;
