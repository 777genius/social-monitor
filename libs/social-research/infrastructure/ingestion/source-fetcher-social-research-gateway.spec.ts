import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import type {
  FetchSourceItemsCommand,
  SourceFetcherPort,
} from '@social-monitor/ingestion/ports';
import { SourceFetchError } from '@social-monitor/ingestion/ports';
import {
  planSocialSearch,
  type SocialResearchExecutionScope,
  type SocialThreadReaderPort,
} from '@social-monitor/social-research';

import {
  SourceFetcherSocialResearchGateway,
  SourceFetcherSocialResearchGatewayError,
} from './source-fetcher-social-research-gateway';
import { createDefaultSourceFetcherLaneExecutionCompiler } from './source-fetcher-lane-execution-compiler';

describe('SourceFetcherSocialResearchGateway', () => {
  it('executes search and listing lanes through SourceFetcherPort', async () => {
    const calls: FetchSourceItemsCommand[] = [];
    const gateway = new SourceFetcherSocialResearchGateway({
      async fetch(command) {
        calls.push(command);

        return {
          items: [
            {
              externalId: `${command.providerKey}:${command.sourceQuery.mode}`,
              canonicalUrl: `https://example.test/${command.providerKey}/${command.sourceQuery.mode}`,
              title: `${command.providerKey} result`,
              body: command.sourceQuery.query,
              publishedAt: new Date('2026-07-04T00:00:00.000Z'),
              metadata: { likes: 10, comments: 2 },
            },
          ],
        };
      },
    } satisfies SourceFetcherPort);
    const plan = validPlan();

    const result = await gateway.executeSearchPlan({
      plan,
      execution: executionScope(),
    });

    expect(calls.map((call) => call.sourceQuery)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ mode: 'search', query: 'AI coding agents' }),
        expect.objectContaining({ mode: 'listing', query: 'claudeai:top' }),
      ]),
    );
    expect(
      calls.find((call) => call.sourceQuery.mode === 'listing')?.sourceQuery
        .parameters,
    ).toEqual(expect.objectContaining({ maxItems: 20, topTime: 'week' }));
    expect(result.items).toHaveLength(2);
    expect(result.rankedItems?.[0]?.item.evidence).toEqual(
      expect.arrayContaining([expect.stringContaining('lane:')]),
    );
  });

  it('maps URL lanes to url source queries', async () => {
    const calls: FetchSourceItemsCommand[] = [];
    const gateway = new SourceFetcherSocialResearchGateway({
      async fetch(command) {
        calls.push(command);

        return {
          items: [],
          warnings: [],
        };
      },
    } satisfies SourceFetcherPort);

    await gateway.executeSearchPlan({
      plan: rssUrlPlan(),
      execution: {
        ...executionScope(),
        sourceBindingIdBySource: {
          rss: 'binding-rss',
        },
      },
    });

    expect(calls.map((call) => call.sourceQuery)).toEqual([
      {
        mode: 'url',
        query: 'https://example.com/feed.xml',
        parameters: {
          maxItems: 20,
        },
      },
    ]);
  });

  it('executes Reddit scan-pass batches through an injected lane compiler', async () => {
    const calls: FetchSourceItemsCommand[] = [];
    const gateway = new SourceFetcherSocialResearchGateway(
      {
        async fetch(command) {
          calls.push(command);

          return {
            items: [
              {
                externalId: 'reddit:batched',
                canonicalUrl: 'https://example.test/reddit/batched',
                title: 'Batched Reddit result',
                body: command.sourceQuery.query,
                publishedAt: new Date('2026-07-04T00:00:00.000Z'),
              },
            ],
          };
        },
      } satisfies SourceFetcherPort,
      {
        laneExecutionCompiler: createDefaultSourceFetcherLaneExecutionCompiler(),
      },
    );

    const result = await gateway.executeSearchPlan({
      plan: validPlan(),
      execution: executionScope(),
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.sourceQuery).toEqual(
      expect.objectContaining({
        mode: 'search',
        query: 'AI coding agents',
        parameters: expect.objectContaining({
          scanPasses: expect.arrayContaining([
            expect.objectContaining({
              mode: 'search',
              query: 'AI coding agents',
            }),
            expect.objectContaining({
              mode: 'listing',
              subreddit: 'claudeai',
              listing: 'top',
              topTime: 'week',
            }),
          ]),
        }),
      }),
    );
    expect(result.items[0]?.evidence).toEqual(
      expect.arrayContaining([
        expect.stringContaining('lane:reddit:general'),
        expect.stringContaining('lane:reddit:community_listing'),
      ]),
    );
  });

  it('executes X account recall as one multi-query search through the default source compiler', async () => {
    const calls: FetchSourceItemsCommand[] = [];
    const gateway = new SourceFetcherSocialResearchGateway(
      {
        async fetch(command) {
          calls.push(command);

          return {
            items: [
              {
                externalId: 'x-twitter:post-1',
                canonicalUrl: 'https://x.com/openai/status/1',
                title: 'OpenAI post',
                body: command.sourceQuery.query,
                publishedAt: new Date('2026-07-04T00:00:00.000Z'),
              },
            ],
          };
        },
      } satisfies SourceFetcherPort,
      {
        laneExecutionCompiler: createDefaultSourceFetcherLaneExecutionCompiler(),
      },
    );

    await gateway.executeSearchPlan({
      plan: xPlan(),
      execution: {
        ...executionScope(),
        sourceBindingIdBySource: {
          'x-twitter': 'binding-x',
        },
      },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      providerKey: 'x-twitter',
      sourceQuery: {
        mode: 'search',
        query: 'AI coding agents MCP',
        parameters: expect.objectContaining({
          searchQueries: expect.arrayContaining([
            'from:openai',
            '@openai',
            '"Claude Code" OR "OpenAI Codex"',
          ]),
        }),
      },
    });
  });

  it('deduplicates items returned by multiple lanes while preserving evidence', async () => {
    const gateway = new SourceFetcherSocialResearchGateway({
      async fetch(command) {
        return {
          items: [
            {
              externalId: 'reddit:shared',
              canonicalUrl: 'https://example.test/shared',
              title: 'Claude Code MCP server',
              body: command.sourceQuery.query,
              publishedAt: new Date('2026-07-04T00:00:00.000Z'),
            },
          ],
        };
      },
    } satisfies SourceFetcherPort);

    const result = await gateway.executeSearchPlan({
      plan: validPlan(),
      execution: executionScope(),
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.evidence?.filter((entry) => entry.startsWith('lane:')))
      .toHaveLength(2);
  });

  it('keeps partial results when one lane is rate limited', async () => {
    const gateway = new SourceFetcherSocialResearchGateway({
      async fetch(command) {
        if (command.sourceQuery.mode === 'listing') {
          throw new SourceFetchError({
            providerKey: command.providerKey,
            kind: 'rate_limited',
            retryable: true,
            message: 'limited',
          });
        }

        return {
          items: [
            {
              externalId: 'reddit:ok',
              canonicalUrl: 'https://example.test/ok',
              title: 'ok',
              body: 'AI coding agents',
              publishedAt: new Date('2026-07-04T00:00:00.000Z'),
            },
          ],
        };
      },
    } satisfies SourceFetcherPort);

    const result = await gateway.executeSearchPlan({
      plan: validPlan(),
      execution: executionScope(),
    });

    expect(result.partial).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('kind=rate_limited retryable=true'),
      ]),
    );
  });

  it('requires explicit execution scope', async () => {
    const gateway = new SourceFetcherSocialResearchGateway({
      async fetch() {
        throw new Error('should not execute');
      },
    } satisfies SourceFetcherPort);

    await expect(
      gateway.executeSearchPlan({ plan: validPlan() }),
    ).rejects.toBeInstanceOf(SourceFetcherSocialResearchGatewayError);
  });

  it('delegates thread fetches to a configured thread reader with execution scope', async () => {
    const calls: string[] = [];
    const gateway = new SourceFetcherSocialResearchGateway(
      {
        async fetch() {
          throw new Error('should not execute');
        },
      } satisfies SourceFetcherPort,
      {
        executionScope: executionScope(),
        threadReader: {
          async fetchThread(command) {
            calls.push(
              command.execution.sourceBindingIdBySource.reddit ?? 'missing',
            );

            return {
              root: {
                itemId: command.externalId ?? 'thread-root',
                sourceKey: command.sourceKey ?? 'reddit',
                canonicalUrl: 'https://www.reddit.com/r/test/comments/thread',
                title: 'Thread root',
                body: 'Root body',
              },
              units: [
                {
                  unitId: 'comment-1',
                  body: 'Comment body',
                },
              ],
              warnings: [],
            };
          },
        } satisfies SocialThreadReaderPort,
      },
    );

    const result = await gateway.fetchThread({
      sourceKey: 'reddit',
      externalId: 'reddit:t3_thread',
    });

    expect(calls).toEqual(['binding-reddit']);
    expect(result.root.itemId).toBe('reddit:t3_thread');
  });

  it('fails fast when thread fetch has no dedicated reader', async () => {
    const gateway = new SourceFetcherSocialResearchGateway({
      async fetch() {
        throw new Error('should not execute');
      },
    } satisfies SourceFetcherPort);

    await expect(
      gateway.fetchThread({ externalId: 'reddit:t3_thread' }),
    ).rejects.toMatchObject({
      code: 'thread_fetch_not_configured',
    });
  });
});

const validPlan = () => {
  const result = planSocialSearch(
    {
      topic: 'AI coding agents',
      sources: ['reddit'],
      depth: 'light',
      entities: {
        communities: [{ name: 'ClaudeAI', listings: ['top'] }],
      },
    },
    {
      sourceLimits: [
        {
          sourceKey: 'reddit',
          maxLanes: 2,
        },
      ],
    },
  );

  if (!result.ok) {
    throw new Error('expected valid plan');
  }

  return result.plan;
};

const rssUrlPlan = () => {
  const result = planSocialSearch({
    topic: 'AI coding agents',
    sources: ['rss'],
    depth: 'light',
    entities: {
      urls: ['https://example.com/feed.xml'],
    },
  });

  if (!result.ok) {
    throw new Error('expected valid RSS plan');
  }

  return result.plan;
};

const xPlan = () => {
  const result = planSocialSearch({
    topic: 'AI coding agents MCP',
    sources: ['x-twitter'],
    depth: 'balanced',
    entities: {
      handles: ['openai'],
      products: ['Claude Code', 'OpenAI Codex'],
    },
  });

  if (!result.ok) {
    throw new Error('expected valid X plan');
  }

  return result.plan;
};

const executionScope = (): SocialResearchExecutionScope => ({
  tenantId: tenantId('tenant-sdk-test'),
  workspaceId: workspaceId('workspace-sdk-test'),
  scanJobId: 'scan-sdk-test',
  correlationId: 'correlation-sdk-test',
  sourceBindingIdBySource: {
    reddit: 'binding-reddit',
  },
});
