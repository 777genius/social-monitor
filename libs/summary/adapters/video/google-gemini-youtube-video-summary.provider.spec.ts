import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { GoogleGeminiYoutubeVideoSummaryProvider } from './google-gemini-youtube-video-summary.provider';

describe('GoogleGeminiYoutubeVideoSummaryProvider', () => {
  it('uses Gemini generateContent with YouTube file_data and maps the structured response', async () => {
    const calls: Array<{
      url: string;
      body: unknown;
      headers: Readonly<Record<string, string>>;
      signal?: AbortSignal;
    }> = [];
    const provider = new GoogleGeminiYoutubeVideoSummaryProvider({
      apiKey: 'test-key',
      model: 'gemini-3.1-flash-lite',
      estimatedInputCostUsdPerMillionTokens: 0.1,
      estimatedOutputCostUsdPerMillionTokens: 0.4,
      fetch: async (url, init) => {
        calls.push({
          url,
          body: JSON.parse(init.body) as unknown,
          headers: init.headers,
          signal: init.signal,
        });

        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        summary: 'The video covers a product launch.',
                        key_points: ['Product launch', 'Next steps'],
                        chapters: [
                          {
                            start_time: '02:10',
                            title: 'Launch',
                            summary: 'Launch details are explained.',
                          },
                        ],
                        follow_up_questions: ['What is the rollout date?'],
                        confidence: {
                          score: 0.82,
                          level: 'high',
                          rationale: 'Clear claims in video.',
                        },
                      }),
                    },
                  ],
                },
              },
            ],
            usageMetadata: {
              promptTokenCount: 100,
              candidatesTokenCount: 25,
            },
          }),
          text: async () => '',
        };
      },
    });

    const result = await provider.summarize({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      topicId: 'topic-1',
      feedItemId: 'feed-1',
      sourceItemId: 'source-1',
      sourceBindingId: 'binding-1',
      url: 'https://www.youtube.com/watch?v=9hE5-98ZeCg',
      title: 'Launch video',
      observedAt: new Date('2026-06-21T00:00:00.000Z'),
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent',
    );
    expect(calls[0]?.signal).toBeInstanceOf(AbortSignal);
    expect(calls[0]?.headers['x-goog-api-key']).toBe('test-key');
    expect(calls[0]?.body).toMatchObject({
      contents: [
        {
          parts: expect.arrayContaining([
            {
              file_data: {
                file_uri: 'https://www.youtube.com/watch?v=9hE5-98ZeCg',
              },
            },
          ]),
        },
      ],
    });
    expect(result).toMatchObject({
      provider: 'google-gemini',
      model: 'gemini-3.1-flash-lite',
      summary: 'The video covers a product launch.',
      keyPoints: ['Product launch', 'Next steps'],
      chapters: [
        {
          startTime: '02:10',
          title: 'Launch',
          summary: 'Launch details are explained.',
        },
      ],
      followUpQuestions: ['What is the rollout date?'],
      confidence: {
        level: 'high',
        score: 0.82,
      },
      usage: {
        inputTokens: 100,
        outputTokens: 25,
        estimatedCostUsd: 0.00002,
      },
    });
  });

  it('skips non-YouTube urls', async () => {
    const provider = new GoogleGeminiYoutubeVideoSummaryProvider({
      apiKey: 'test-key',
      model: 'gemini-3.1-flash-lite',
      fetch: async () => {
        throw new Error('fetch should not be called');
      },
    });

    await expect(provider.summarize({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      topicId: 'topic-1',
      feedItemId: 'feed-1',
      sourceItemId: 'source-1',
      sourceBindingId: 'binding-1',
      url: 'https://example.com/video',
      title: 'External video',
      observedAt: new Date('2026-06-21T00:00:00.000Z'),
    })).resolves.toBeNull();
  });

  it('accepts model names with the models/ prefix', async () => {
    const urls: string[] = [];
    const provider = new GoogleGeminiYoutubeVideoSummaryProvider({
      apiKey: 'test-key',
      model: 'models/gemini-3.1-flash-lite',
      fetch: async (url) => {
        urls.push(url);

        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        summary: 'Summary.',
                      }),
                    },
                  ],
                },
              },
            ],
          }),
          text: async () => '',
        };
      },
    });

    await provider.summarize({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      topicId: 'topic-1',
      feedItemId: 'feed-1',
      sourceItemId: 'source-1',
      sourceBindingId: 'binding-1',
      url: 'https://www.youtube.com/watch?v=9hE5-98ZeCg',
      title: 'Launch video',
      observedAt: new Date('2026-06-21T00:00:00.000Z'),
    });

    expect(urls).toEqual([
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent',
    ]);
  });
});
