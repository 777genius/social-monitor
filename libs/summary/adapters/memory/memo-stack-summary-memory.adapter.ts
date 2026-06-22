import type {
  BuildSummaryMemoryContextQuery,
  RecordSummaryFeedbackMemoryCommand,
  SummaryMemoryContext,
  SummaryMemoryDiagnostics,
  SummaryMemoryPort,
  SummaryMemoryWriteResult,
} from '../../ports';

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type MemoStackSummaryMemoryAdapterOptions = {
  readonly baseUrl: string;
  readonly token: string;
  readonly timeoutMs?: number;
  readonly fetchFn?: FetchLike;
};

type MemoStackContextResponse = {
  readonly data?: {
    readonly rendered_text?: unknown;
    readonly diagnostics?: unknown;
  };
};

const defaultTimeoutMs = 10_000;
const contextTokenBudget = 900;
const maxMemoryFacts = 12;
const maxMemoryChunks = 8;

export class MemoStackSummaryMemoryAdapter implements SummaryMemoryPort {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: FetchLike;

  constructor(options: MemoStackSummaryMemoryAdapterOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.token = options.token.trim();
    this.timeoutMs = positiveIntegerOrFallback(options.timeoutMs, defaultTimeoutMs);
    this.fetchFn = options.fetchFn ?? fetch;

    if (this.baseUrl.length === 0) {
      throw new Error('Memo-stack summary memory baseUrl must be non-empty');
    }
    if (this.token.length === 0) {
      throw new Error('Memo-stack summary memory token must be non-empty');
    }
  }

  async buildContext(query: BuildSummaryMemoryContextQuery): Promise<SummaryMemoryContext> {
    const response = await this.post<MemoStackContextResponse>('/v1/context', this.contextRequest(query));
    const renderedText = stringOrUndefined(response.data?.rendered_text);
    const diagnostics = asDiagnostics(response.data?.diagnostics);
    const status = renderedText === undefined || renderedText.trim().length === 0 ? 'empty' : 'available';

    if (status === 'empty' && diagnostics.scope_not_found === true) {
      const fallback = await this.post<MemoStackContextResponse>('/v1/context', this.contextRequest(query, {
        memoryScopeExternalRefs: [topicFeedbackScope(query.topicId)],
      }));
      const fallbackRenderedText = stringOrUndefined(fallback.data?.rendered_text);
      return {
        status: fallbackRenderedText === undefined || fallbackRenderedText.trim().length === 0 ? 'empty' : 'available',
        renderedText: fallbackRenderedText,
        diagnostics: {
          ...asDiagnostics(fallback.data?.diagnostics),
          fallbackFromScopeNotFound: true,
        },
        retrievedAt: query.requestedAt,
      };
    }

    return {
      status,
      renderedText,
      diagnostics,
      retrievedAt: query.requestedAt,
    };
  }

  async recordSummaryFeedback(command: RecordSummaryFeedbackMemoryCommand): Promise<SummaryMemoryWriteResult> {
    if (command.comment === undefined && command.rating >= 4 && command.category === 'other') {
      return {
        status: 'skipped',
        diagnostics: { reason: 'low_signal_feedback' },
      };
    }

    const response = await this.post<Record<string, unknown>>('/v1/facts', {
      space_slug: spaceSlug(command.tenantId, command.workspaceId),
      memory_scope_external_ref: topicFeedbackScope(command.topicId),
      text: feedbackMemoryText(command),
      kind: 'summary_feedback',
      classification: 'internal',
      category: 'summary_feedback',
      tags: feedbackTags(command),
      ttl_policy: 'durable',
      source_refs: [
        {
          source_type: 'social-monitor.summary-feedback',
          source_id: command.feedbackId,
          summary_id: command.summaryId,
          citation_id: command.citationId,
          feed_item_id: command.feedItemId,
          source_item_id: command.sourceItemId,
          provider_key: command.providerKey,
        },
      ],
    }, {
      idempotencyKey: `social-monitor:summary-feedback:${command.tenantId}:${command.workspaceId}:${command.idempotencyKey}`,
    });

    return {
      status: 'written',
      diagnostics: {
        provider: 'memo-stack',
        responseStatus: nestedString(response, ['data', 'indexing_status']),
      },
    };
  }

  private contextRequest(
    query: BuildSummaryMemoryContextQuery,
    overrides: { readonly memoryScopeExternalRefs?: readonly string[] } = {},
  ): Record<string, unknown> {
    return {
      space_slug: spaceSlug(query.tenantId, query.workspaceId),
      memory_scope_external_refs: overrides.memoryScopeExternalRefs ?? readMemoryScopes(query),
      query: contextQuery(query),
      token_budget: contextTokenBudget,
      max_facts: maxMemoryFacts,
      max_chunks: maxMemoryChunks,
      max_evidence_items: 5,
      consistency_mode: 'best_effort',
      include_stale: false,
    };
  }

  private async post<T>(
    path: string,
    body: Record<string, unknown>,
    options: { readonly idempotencyKey?: string } = {},
  ): Promise<T> {
    const response = await this.request(path, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.token}`,
        'content-type': 'application/json',
        ...(options.idempotencyKey === undefined ? {} : { 'idempotency-key': options.idempotencyKey }),
      },
      body: JSON.stringify(withoutUndefined(body)),
    });
    return await readJson<T>(response);
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    timeout.unref?.();

    try {
      const response = await this.fetchFn(new URL(`${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`), {
        ...init,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Memo-stack memory request failed with status ${response.status}: ${safeResponseBody(await response.text())}`);
      }

      return response;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Memo-stack memory request timed out');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
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

const readMemoryScopes = (query: BuildSummaryMemoryContextQuery): readonly string[] => [
  topicFeedbackScope(query.topicId),
  `topic:${query.topicId}:preferences`,
  ...(query.userId === undefined ? [] : [`user:${query.userId}:preferences`]),
  ...(query.subscriptionId === undefined ? [] : [`subscription:${query.subscriptionId}:preferences`]),
  'workspace-global',
];

const contextQuery = (query: BuildSummaryMemoryContextQuery): string => {
  const evidenceTitles = query.evidence.items
    .slice(0, 5)
    .map((item) => item.title.trim())
    .filter((title) => title.length > 0)
    .join(' | ');
  const userPart = query.userId === undefined ? '' : ` user:${query.userId}`;

  return [`summary guidance topic:${query.topicId}${userPart}`, evidenceTitles].filter((part) => part.length > 0).join(' evidence: ');
};

const feedbackMemoryText = (command: RecordSummaryFeedbackMemoryCommand): string => [
  `Summary feedback for topic ${command.topicId}: rating ${command.rating}/5, category ${command.category}.`,
  command.comment === undefined ? '' : `User note: ${command.comment}`,
  command.citationId === undefined ? '' : `Citation ${command.citationId} was involved.`,
  command.providerKey === undefined ? '' : `Provider ${command.providerKey} was involved.`,
].filter((line) => line.length > 0).join(' ');

const feedbackTags = (command: RecordSummaryFeedbackMemoryCommand): readonly string[] => [
  'summary-feedback',
  `rating-${command.rating}`,
  `category-${command.category}`,
  ...(command.providerKey === undefined ? [] : [`provider-${command.providerKey}`]),
];

const normalizeBaseUrl = (value: string): string => value.trim().replace(/\/+$/u, '');

const positiveIntegerOrFallback = (value: number | undefined, fallback: number): number =>
  value !== undefined && Number.isInteger(value) && value > 0 ? value : fallback;

const parsePositiveInteger = (value: string | undefined): number | undefined => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

const stringOrUndefined = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value : undefined;

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

const withoutUndefined = (value: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));

const readJson = async <T>(response: Response): Promise<T> => {
  const text = await response.text();
  if (text.trim().length === 0) {
    return {} as T;
  }
  return JSON.parse(text) as T;
};

const safeResponseBody = (body: string): string =>
  body
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/([?&](?:token|api_key|apikey|secret|password)=)[^&\s]+/gi, '$1[REDACTED]')
    .slice(0, 240);
