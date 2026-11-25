import { InfinityContextClient } from '@infinity-context/sdk';
import { isSensitiveKey, redactSensitiveText } from '@social-monitor/shared-kernel';

import type {
  BuildRelevanceMemoryGuidanceQuery,
  RelevanceMemoryGuidanceReaderPort,
  RelevanceMemoryGuidanceResult,
} from '../../ports';

type MemoStackRelevanceMemoryGuidanceClient = {
  readonly context: {
    buildContext(request: MemoStackBuildContextRequest): Promise<unknown>;
  };
};

type MemoStackBuildContextRequest = {
  readonly spaceSlug: string;
  readonly memoryScopeExternalRefs: readonly string[];
  readonly query: string;
  readonly tokenBudget: number;
  readonly maxFacts: number;
  readonly maxChunks: number;
  readonly maxEvidenceItems: number;
  readonly consistencyMode: 'best_effort';
  readonly includeStale: false;
};

export type MemoStackRelevanceMemoryGuidanceReaderOptions = {
  readonly baseUrl: string;
  readonly token: string;
  readonly timeoutMs?: number;
  readonly client?: MemoStackRelevanceMemoryGuidanceClient;
};

const defaultTimeoutMs = 30_000;
const maxGuidanceKeywords = 20;

export class MemoStackRelevanceMemoryGuidanceReader implements RelevanceMemoryGuidanceReaderPort {
  private readonly client: MemoStackRelevanceMemoryGuidanceClient;

  constructor(options: MemoStackRelevanceMemoryGuidanceReaderOptions) {
    const baseUrl = normalizeBaseUrl(options.baseUrl);
    const token = options.token.trim();

    if (baseUrl.length === 0) throw new Error('Memo-stack relevance guidance baseUrl must be non-empty');
    if (token.length === 0) throw new Error('Memo-stack relevance guidance token must be non-empty');

    this.client = options.client ?? new InfinityContextClient({
      baseUrl,
      token,
      timeoutMs: positiveIntegerOrFallback(options.timeoutMs, defaultTimeoutMs),
    });
  }

  async buildGuidance(query: BuildRelevanceMemoryGuidanceQuery): Promise<RelevanceMemoryGuidanceResult> {
    try {
      const response = await this.client.context.buildContext(contextRequest(query));
      const renderedText = renderedTextFromResponse(response);

      if (renderedText === undefined) {
        return {
          status: 'empty',
          diagnostics: diagnosticsFromResponse(response),
        };
      }

      return guidanceFromRenderedText({
        renderedText,
        providerKeys: query.providerKeys,
        keywords: query.keywords,
        diagnostics: diagnosticsFromResponse(response),
      });
    } catch (error) {
      return {
        status: 'unavailable',
        diagnostics: {
          error: error instanceof Error ? error.message : 'unknown memo-stack relevance guidance error',
        },
      };
    }
  }
}

export const resolveMemoStackRelevanceMemoryGuidanceReaderOptions = (
  env: NodeJS.ProcessEnv,
): MemoStackRelevanceMemoryGuidanceReaderOptions => ({
  baseUrl: env.INFINITY_CONTEXT_URL ?? '',
  token: env.INFINITY_CONTEXT_TOKEN ?? '',
  timeoutMs: parsePositiveInteger(env.RELEVANCE_MEMORY_TIMEOUT_MS ?? env.SUMMARY_MEMORY_TIMEOUT_MS),
});

const contextRequest = (query: BuildRelevanceMemoryGuidanceQuery): MemoStackBuildContextRequest => {
  const keywords = safeKeywords(query.keywords).slice(0, maxGuidanceKeywords);

  return {
    spaceSlug: spaceSlug(query.tenantId, query.workspaceId),
    memoryScopeExternalRefs: [userPreferenceScope(query.userId)],
    query: redactSensitiveText([
      'ranking guidance for scoped user preferences',
      `providers: ${query.providerKeys.join(', ')}`,
      keywords.length === 0 ? '' : `keywords: ${keywords.join(', ')}`,
    ].filter((part) => part.length > 0).join(' ')),
    tokenBudget: 600,
    maxFacts: 10,
    maxChunks: 0,
    maxEvidenceItems: 5,
    consistencyMode: 'best_effort',
    includeStale: false,
  };
};

const guidanceFromRenderedText = (params: {
  readonly renderedText: string;
  readonly providerKeys: readonly string[];
  readonly keywords: readonly string[];
  readonly diagnostics: Readonly<Record<string, unknown>>;
}): RelevanceMemoryGuidanceResult => {
  const text = redactSensitiveText(params.renderedText).toLocaleLowerCase('en-US');
  const providerPreferences = [];
  const blockedProviderKeys = [];

  for (const providerKey of params.providerKeys) {
    const provider = providerKey.toLocaleLowerCase('en-US');
    if (includesAny(text, [
      `avoid ${provider} evidence`,
      `avoid similar ${provider} evidence`,
      `${provider} as a low-quality source`,
    ])) {
      blockedProviderKeys.push(providerKey);
      continue;
    }
    if (includesAny(text, [
      `down-rank similar ${provider} evidence`,
      `downrank similar ${provider} evidence`,
      `${provider} evidence as a weak provider-overranked signal`,
    ])) {
      providerPreferences.push({ key: providerKey, weight: -1 });
      continue;
    }
    if (includesAny(text, [
      `prefer similar ${provider} evidence`,
      `prefer ${provider} evidence`,
      `provider ${provider} was involved`,
    ])) {
      providerPreferences.push({ key: providerKey, weight: 1 });
    }
  }

  const keywordPreferences = params.keywords
    .filter((keyword) => text.includes(keyword.toLocaleLowerCase('en-US')))
    .slice(0, maxGuidanceKeywords)
    .map((keyword) => ({ key: keyword, weight: 0.5 }));
  const hasGuidance =
    providerPreferences.length > 0 ||
    blockedProviderKeys.length > 0 ||
    keywordPreferences.length > 0;

  return {
    status: hasGuidance ? 'available' : 'empty',
    providerPreferences,
    keywordPreferences,
    blockedProviderKeys,
    diagnostics: params.diagnostics,
  };
};

const renderedTextFromResponse = (response: unknown): string | undefined => {
  const rendered = stringAt(response, ['data', 'rendered_text']);
  const normalized = rendered?.trim();

  return normalized === undefined || normalized.length === 0
    ? undefined
    : normalized;
};

const diagnosticsFromResponse = (response: unknown): Readonly<Record<string, unknown>> => {
  const diagnostics = valueAt(response, ['data', 'diagnostics']);

  return diagnostics !== null && typeof diagnostics === 'object' && !Array.isArray(diagnostics)
    ? diagnostics as Readonly<Record<string, unknown>>
    : {};
};

const valueAt = (value: unknown, path: readonly string[]): unknown => {
  let current = value;
  for (const segment of path) {
    if (current === null || typeof current !== 'object' || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
};

const stringAt = (value: unknown, path: readonly string[]): string | undefined => {
  const result = valueAt(value, path);

  return typeof result === 'string' ? result : undefined;
};

const includesAny = (value: string, needles: readonly string[]): boolean =>
  needles.some((needle) => value.includes(needle));

const safeKeywords = (keywords: readonly string[]): readonly string[] =>
  keywords.filter((keyword) => !isSensitiveKey(keyword));

const spaceSlug = (tenantId: string, workspaceId: string): string =>
  `social-monitor:${tenantId}:${workspaceId}`;

const userPreferenceScope = (userId: string): string =>
  `user:${userId}:preferences`;

const normalizeBaseUrl = (value: string): string =>
  value.trim().replace(/\/+$/u, '');

const positiveIntegerOrFallback = (value: number | undefined, fallback: number): number =>
  value !== undefined && Number.isInteger(value) && value > 0 ? value : fallback;

const parsePositiveInteger = (value: string | undefined): number | undefined => {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};
