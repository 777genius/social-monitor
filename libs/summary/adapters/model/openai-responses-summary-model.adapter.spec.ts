import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { SummaryModelInput } from '../../ports';
import {
  OpenAiResponsesSummaryModelAdapter,
  resolveOpenAiResponsesSummaryModelOptions,
} from './openai-responses-summary-model.adapter';

describe('OpenAiResponsesSummaryModelAdapter', () => {
  it('creates a Responses API request with structured summary output contract', async () => {
    const capturedCalls: CapturedFetchCall[] = [];
    const adapter = new OpenAiResponsesSummaryModelAdapter({
      apiKey: fakeOpenAiApiKey,
      model: 'test-summary-model',
      fetchFn: async (url, init) => {
        capturedCalls.push({ url: String(url), init });

        return jsonResponse(200, {
          output_text: JSON.stringify(validProviderDraft()),
          usage: {
            input_tokens: 321,
            output_tokens: 123,
          },
        });
      },
    });

    const input = buildInput();
    const route = adapter.route(input, {
      preferredProvider: 'openai-responses',
      maxInputTokens: 12_000,
      maxOutputTokens: 1_500,
      maxEstimatedCostUsd: 1,
    }, {
      remainingTokens: 20_000,
      remainingCostUsd: 1,
    });
    const attempt = await adapter.summarize(input, route);
    const request = JSON.parse(String(capturedCalls[0]?.init?.body)) as Record<string, unknown>;
    const text = request.text as { readonly format: Record<string, unknown> };

    expect(capturedCalls).toHaveLength(1);
    expect(capturedCalls[0]?.url).toBe('https://api.openai.com/v1/responses');
    expect(capturedCalls[0]?.init?.headers).toMatchObject({
      authorization: `Bearer ${fakeOpenAiApiKey}`,
      'content-type': 'application/json',
    });
    expect(request).toMatchObject({
      model: 'test-summary-model',
      store: false,
      max_output_tokens: 1_500,
    });
    expect(text.format).toMatchObject({
      type: 'json_schema',
      name: 'social_monitor_summary_artifact',
      strict: true,
    });
    expect(attempt.draft.headline).toBe('Backend signals are converging');
    expect(attempt.draft.keyPoints[0]?.citationIds).toEqual(['c1']);
    expect(attempt.draft.citationMap[0]?.feedItemId).toBe('feed-1');
    expect(attempt.draft.citationMap[0]?.providerKey).toBe('reddit');
    expect(attempt.draft.usage).toMatchObject({
      inputTokens: 321,
      outputTokens: 123,
    });
    expect(adapter.validateRawProviderResponse(attempt)).toEqual({ ok: true });
  });

  it('does not call OpenAI when selected evidence is empty', async () => {
    const fetchFn = jest.fn();
    const adapter = new OpenAiResponsesSummaryModelAdapter({
      apiKey: fakeOpenAiApiKey,
      fetchFn,
    });
    const input = buildInput({ evidenceItems: [] });
    const route = adapter.route(input, {
      preferredProvider: 'openai-responses',
      maxInputTokens: 12_000,
      maxOutputTokens: 1_500,
      maxEstimatedCostUsd: 1,
    }, {
      remainingTokens: 20_000,
      remainingCostUsd: 1,
    });

    const attempt = await adapter.summarize(input, route);

    expect(fetchFn).not.toHaveBeenCalled();
    expect(attempt.draft.qualityFlags).toContain('no_signal');
    expect(attempt.draft.noSignalReason).toBe('No eligible evidence items selected for this topic.');
    expect(adapter.validateRawProviderResponse(attempt)).toEqual({ ok: true });
  });

  it('passes structured memory context into the Responses prompt payload', async () => {
    const capturedCalls: CapturedFetchCall[] = [];
    const adapter = new OpenAiResponsesSummaryModelAdapter({
      apiKey: fakeOpenAiApiKey,
      model: 'test-summary-model',
      fetchFn: async (url, init) => {
        capturedCalls.push({ url: String(url), init });

        return jsonResponse(200, {
          output_text: JSON.stringify(validProviderDraft()),
          usage: {
            input_tokens: 321,
            output_tokens: 123,
          },
        });
      },
    });
    const input = buildInput({
      memoryContext: {
        status: 'available',
        renderedText: 'Memory: prefer security fixes and concise phrasing.',
        sourceRefs: [
          {
            source_type: 'social-monitor.summary-feedback',
            source_id: 'feedback-1',
          },
        ],
        retrieval: {
          vectorStatus: 'ok',
          graphStatus: 'ok',
          itemsUsed: 1,
          factsUsed: 1,
        },
        staleMarkers: {
          staleFactsConsidered: 1,
          staleFactsUsed: 0,
        },
        support: {
          status: 'supported',
          itemsReturned: 1,
          warnings: ['memory-preference-only'],
        },
        diagnostics: {
          vector_status: 'ok',
          graph_status: 'ok',
        },
        retrievedAt: new Date('2026-06-21T09:59:00.000Z'),
      },
    });
    const route = adapter.route(input, {
      preferredProvider: 'openai-responses',
      maxInputTokens: 12_000,
      maxOutputTokens: 1_500,
      maxEstimatedCostUsd: 1,
    }, {
      remainingTokens: 20_000,
      remainingCostUsd: 1,
    });

    await adapter.summarize(input, route);

    const request = JSON.parse(String(capturedCalls[0]?.init?.body)) as { readonly input: string };
    const promptPayload = JSON.parse(request.input) as {
      readonly memoryContext?: Record<string, unknown>;
    };
    expect(promptPayload.memoryContext).toMatchObject({
      status: 'available',
      renderedText: 'Memory: prefer security fixes and concise phrasing.',
      sourceRefs: [
        {
          source_type: 'social-monitor.summary-feedback',
          source_id: 'feedback-1',
        },
      ],
      retrieval: {
        vectorStatus: 'ok',
        graphStatus: 'ok',
        itemsUsed: 1,
        factsUsed: 1,
      },
      staleMarkers: {
        staleFactsConsidered: 1,
        staleFactsUsed: 0,
      },
      support: {
        status: 'supported',
        itemsReturned: 1,
        warnings: ['memory-preference-only'],
      },
      diagnostics: {
        vector_status: 'ok',
        graph_status: 'ok',
      },
      retrievedAt: '2026-06-21T09:59:00.000Z',
    });
  });

  it('classifies provider rate limits as retryable failures', async () => {
    const adapter = new OpenAiResponsesSummaryModelAdapter({
      apiKey: fakeOpenAiApiKey,
      fetchFn: async () => jsonResponse(429, { error: { message: 'Rate limit reached' } }),
    });
    const input = buildInput();
    const route = adapter.route(input, {
      preferredProvider: 'openai-responses',
      maxInputTokens: 12_000,
      maxOutputTokens: 1_500,
      maxEstimatedCostUsd: 1,
    }, {
      remainingTokens: 20_000,
      remainingCostUsd: 1,
    });

    await expect(adapter.summarize(input, route)).rejects.toThrow('Rate limit reached');

    try {
      await adapter.summarize(input, route);
    } catch (error) {
      expect(adapter.classifyError(error)).toEqual({
        kind: 'provider_rate_limited',
        retryable: true,
        message: 'Rate limit reached',
      });
    }
  });

  it('rejects invalid provider citations before artifact creation', async () => {
    const adapter = new OpenAiResponsesSummaryModelAdapter({
      apiKey: fakeOpenAiApiKey,
      fetchFn: async () => jsonResponse(200, {
        output_text: JSON.stringify({
          ...validProviderDraft(),
          keyPoints: [
            {
              claim: 'This cites missing evidence',
              citationIds: ['missing-citation'],
            },
          ],
        }),
      }),
    });
    const input = buildInput();
    const route = adapter.route(input, {
      preferredProvider: 'openai-responses',
      maxInputTokens: 12_000,
      maxOutputTokens: 1_500,
      maxEstimatedCostUsd: 1,
    }, {
      remainingTokens: 20_000,
      remainingCostUsd: 1,
    });

    await expect(adapter.summarize(input, route)).rejects.toThrow('Summary key point cites unknown citation');
  });

  it('requires an OpenAI API key when openai-responses mode is selected', () => {
    expect(() =>
      resolveOpenAiResponsesSummaryModelOptions({}, {
        requireApiKey: true,
      }),
    ).toThrow('SUMMARY_MODEL_PROVIDER=openai-responses requires OPENAI_API_KEY');
    expect(resolveOpenAiResponsesSummaryModelOptions({}, {
      requireApiKey: false,
    })).toMatchObject({
      apiKey: '',
    });
  });
});

type CapturedFetchCall = {
  readonly url: string;
  readonly init?: RequestInit;
};

const fakeOpenAiApiKey = ['test', 'openai', 'key'].join('-');

const buildInput = (params: {
  readonly evidenceItems?: SummaryModelInput['evidence']['items'];
  readonly memoryContext?: SummaryModelInput['memoryContext'];
} = {}): SummaryModelInput => {
  const now = new Date('2026-06-21T10:00:00.000Z');
  const evidenceItems = params.evidenceItems ?? [
    {
      feedItemId: 'feed-1',
      sourceItemId: 'source-1',
      sourceBindingId: 'binding-reddit',
      providerKey: 'reddit',
      title: 'Backend signals are converging',
      bodyPreview: 'Queues, scans and summaries passed through the durable runtime.',
      canonicalUrl: 'https://example.test/reddit/backend-signals',
      observedAt: now,
    },
    {
      feedItemId: 'feed-2',
      sourceItemId: 'source-2',
      sourceBindingId: 'binding-github',
      providerKey: 'github',
      title: 'GitHub issues show API hardening work',
      bodyPreview: 'Source bindings and queue drains are the active engineering focus.',
      canonicalUrl: 'https://example.test/github/api-hardening',
      observedAt: now,
    },
  ];

  return {
    tenantId: tenantId('tenant-openai-summary-adapter'),
    workspaceId: workspaceId('workspace-openai-summary-adapter'),
    topicId: 'topic-backend-mvp',
    evidence: {
      sourceWindow: {
        windowId: 'summary-window-1',
        startedAt: new Date('2026-06-21T09:00:00.000Z'),
        endedAt: now,
        selectedFeedItemIds: evidenceItems.map((item) => item.feedItemId),
      },
      items: evidenceItems,
    },
    memoryContext: params.memoryContext,
    policy: {
      language: 'en',
      format: 'executive_brief',
      tone: 'concise',
      maxKeyPoints: 3,
      includeRisks: true,
      includeSourceHighlights: true,
      customInstructions: 'Highlight what matters for backend MVP readiness.',
      rulesVersion: 'summary.rules.policy.v1',
    },
    requestedAt: now,
  };
};

const validProviderDraft = () => ({
  headline: 'Backend signals are converging',
  executiveSummary: 'The backend monitoring loop has enough evidence to summarize durable provider activity.',
  keyPoints: [
    {
      claim: 'Durable backend scan and summary signals are present.',
      citationIds: ['c1'],
    },
  ],
  risksAndUnknowns: [
    {
      description: 'Live provider quotas can still limit scan frequency.',
      citationIds: ['c2'],
      reason: 'source_limit',
    },
  ],
  sourceHighlights: ['Backend durable runtime evidence', 'Provider smoke coverage'],
  citationMap: [
    {
      citationId: 'c1',
      feedItemId: 'feed-1',
      sourceItemId: 'source-1',
      providerKey: 'reddit',
      field: 'title',
    },
    {
      citationId: 'c2',
      feedItemId: 'feed-2',
      sourceItemId: 'source-2',
      providerKey: 'github',
      field: 'bodyPreview',
    },
  ],
  qualityFlags: ['limited_sources'],
  confidence: {
    level: 'medium',
    score: 0.62,
    rationale: 'Evidence covers two independent source bindings.',
  },
  noSignalReason: null,
});

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
    },
  });
