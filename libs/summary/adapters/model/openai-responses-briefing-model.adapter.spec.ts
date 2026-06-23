import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { BriefingModelInput } from '../../ports';
import {
  OpenAiResponsesBriefingModelAdapter,
  resolveOpenAiResponsesBriefingModelOptions,
} from './openai-responses-briefing-model.adapter';

describe('OpenAiResponsesBriefingModelAdapter', () => {
  it('calls the Responses API and normalizes a cited briefing draft', async () => {
    const capturedCalls: { readonly url: string | URL; readonly init?: RequestInit }[] = [];
    const adapter = new OpenAiResponsesBriefingModelAdapter({
      apiKey: 'test-openai-key',
      fetchFn: async (url, init) => {
        capturedCalls.push({ url, init });

        return jsonResponse({
          output_text: JSON.stringify({
            headline: 'Workspace AI tooling signal',
            executiveSummary: 'AI tooling is repeating across monitored sources.',
            topStories: [
              {
                storyClusterId: 'story:ai-tooling',
                title: 'AI tooling library is trending',
                summary: 'Developers are discussing a new AI tooling library.',
                topicIds: ['topic-ai'],
                providerKeys: ['reddit'],
                citationIds: ['c1'],
              },
            ],
            topicHighlights: [],
            repeatedSignals: [],
            risksAndUnknowns: [],
            citationMap: [
              {
                citationId: 'c1',
                feedItemId: 'feed-reddit',
                sourceItemId: 'source-reddit',
                providerKey: 'reddit',
                field: 'title',
              },
            ],
            qualityFlags: [],
            confidence: {
              level: 'medium',
              score: 0.7,
              rationale: 'Primary evidence is cited.',
            },
            noSignalReason: null,
          }),
          usage: {
            input_tokens: 111,
            output_tokens: 222,
          },
        });
      },
    });
    const input = briefingInput();
    const route = adapter.route(input, {
      preferredProvider: 'openai-responses',
      maxInputTokens: 24_000,
      maxOutputTokens: 2_500,
      maxEstimatedCostUsd: 1,
    }, {
      remainingTokens: 32_000,
      remainingCostUsd: 2,
    });

    const attempt = await adapter.generate(input, route);

    expect(capturedCalls[0]?.url).toBe('https://api.openai.com/v1/responses');
    expect(JSON.parse(capturedCalls[0]?.init?.body as string)).toMatchObject({
      model: 'gpt-5.1-mini',
      text: {
        format: {
          type: 'json_schema',
          name: 'social_monitor_briefing_artifact',
          strict: true,
        },
      },
    });
    expect(attempt.draft).toMatchObject({
      headline: 'Workspace AI tooling signal',
      usage: {
        inputTokens: 111,
        outputTokens: 222,
      },
      citationMap: [
        expect.objectContaining({
          feedItemId: 'feed-reddit',
        }),
      ],
    });
    expect(adapter.validateRawProviderResponse(attempt)).toEqual({ ok: true });
  });

  it('does not call OpenAI when selected evidence is empty', async () => {
    let called = false;
    const adapter = new OpenAiResponsesBriefingModelAdapter({
      fetchFn: async () => {
        called = true;
        return jsonResponse({});
      },
    });
    const input = briefingInput({ empty: true });
    const route = adapter.route(input, {
      preferredProvider: 'openai-responses',
      maxInputTokens: 24_000,
      maxOutputTokens: 2_500,
      maxEstimatedCostUsd: 1,
    }, {
      remainingTokens: 32_000,
      remainingCostUsd: 2,
    });

    const attempt = await adapter.generate(input, route);

    expect(called).toBe(false);
    expect(attempt.draft.qualityFlags).toEqual(['no_signal', 'limited_sources']);
  });

  it('requires an OpenAI API key when openai-responses mode is selected', () => {
    expect(() =>
      resolveOpenAiResponsesBriefingModelOptions({}, {
        requireApiKey: true,
      }),
    ).toThrow('BRIEFING_MODEL_PROVIDER=openai-responses requires OPENAI_API_KEY');
  });
});

const briefingInput = (params: { readonly empty?: boolean } = {}): BriefingModelInput => ({
  tenantId: tenantId('tenant-openai-briefing-adapter'),
  workspaceId: workspaceId('workspace-openai-briefing-adapter'),
  scope: { type: 'workspace' },
  evidence: {
    sourceWindow: {
      windowId: 'workspace:openai-briefing',
      startedAt: new Date('2026-06-23T08:00:00.000Z'),
      endedAt: new Date('2026-06-23T08:30:00.000Z'),
      selectedFeedItemIds: params.empty ? [] : ['feed-reddit'],
      storyClusterIds: params.empty ? [] : ['story:ai-tooling'],
    },
    clusters: params.empty
      ? []
      : [
          {
            id: 'story:ai-tooling',
            storyKey: 'url:example.com/ai-tooling',
            representativeFeedItemId: 'feed-reddit',
            duplicateFeedItemIds: [],
            topicIds: ['topic-ai'],
            providerKeys: ['reddit'],
            score: 2.4,
            observedAtRange: {
              startedAt: new Date('2026-06-23T08:00:00.000Z'),
              endedAt: new Date('2026-06-23T08:30:00.000Z'),
            },
            whyImportant: ['Fresh item'],
          },
        ],
    selectedEvidence: params.empty
      ? []
      : [
          {
            feedItemId: 'feed-reddit',
            sourceItemId: 'source-reddit',
            sourceBindingId: 'binding-reddit',
            topicId: 'topic-ai',
            providerKey: 'reddit',
            canonicalUrl: 'https://example.com/ai-tooling',
            title: 'AI tooling library is trending',
            bodyPreview: 'Developers are discussing a new AI tooling library.',
            publishedAt: new Date('2026-06-23T08:00:00.000Z'),
            observedAt: new Date('2026-06-23T08:01:00.000Z'),
            score: 2.4,
            whyImportant: ['Fresh item'],
          },
        ],
  },
  contextArtifacts: [],
  policy: {
    language: 'auto',
    format: 'executive_brief',
    tone: 'analytical',
    maxStories: 10,
    includeRisks: true,
    includeTopicHighlights: true,
    includeRepeatedSignals: true,
    dedupeStrategy: 'canonical_url_then_title',
    rulesVersion: 'briefing.rules.test.v1',
  },
  requestedAt: new Date('2026-06-23T08:31:00.000Z'),
});

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
