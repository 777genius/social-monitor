import { planSocialSearch } from '@social-monitor/social-research';

import {
  createDefaultSourceFetcherLaneExecutionCompiler,
  DefaultSourceFetcherLaneExecutionCompiler,
} from './source-fetcher-lane-execution-compiler';

describe('SourceFetcherLaneExecutionCompiler', () => {
  it('keeps one source fetch per lane without source-specific compilers', () => {
    const compiler = new DefaultSourceFetcherLaneExecutionCompiler();
    const plan = redditPlan();

    const result = compiler.compile(plan.lanes);

    expect(result.executions.map((execution) => execution.sourceQuery)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          mode: 'search',
          query: 'AI agents MCP Claude Code reliability',
          parameters: expect.objectContaining({
            maxItems: 40,
          }),
        }),
        expect.objectContaining({
          mode: 'listing',
          query: 'claudeai:top',
          parameters: expect.objectContaining({
            maxItems: 40,
            topTime: 'week',
          }),
        }),
      ]),
    );
    expect(result.skippedLanes).toEqual([
      expect.objectContaining({
        reason: 'enrichment lane is not executable yet',
      }),
    ]);
  });

  it('compiles Reddit lanes into one provider scan-pass execution', () => {
    const compiler = createDefaultSourceFetcherLaneExecutionCompiler();
    const plan = redditPlan();

    const result = compiler.compile(plan.lanes);

    expect(result.skippedLanes).toEqual([]);
    expect(result.executions).toHaveLength(1);
    expect(result.executions[0]).toMatchObject({
      sourceKey: 'reddit',
      sourceQuery: {
        mode: 'search',
        query: 'AI agents MCP Claude Code reliability',
        parameters: expect.objectContaining({
          includeComments: true,
          maxCommentsPerPost: 20,
          commentSort: 'top',
          maxItems: 100,
          scanPasses: expect.arrayContaining([
            expect.objectContaining({
              mode: 'search',
              query: 'AI agents MCP Claude Code reliability',
              searchSort: 'new',
              allowedSubreddits: ['claudeai'],
              maxItems: 40,
            }),
            expect.objectContaining({
              mode: 'search',
              query: 'AI agents MCP Claude Code reliability',
              searchSort: 'top',
              searchTime: 'week',
              allowedSubreddits: ['claudeai'],
              maxItems: 20,
            }),
            expect.objectContaining({
              mode: 'listing',
              subreddit: 'claudeai',
              listing: 'top',
              topTime: 'week',
              maxItems: 40,
            }),
            expect.objectContaining({
              mode: 'listing',
              subreddit: 'claudeai',
              listing: 'hot',
              maxItems: 40,
            }),
          ]),
        }),
      },
    });
  });

  it('compiles X lanes into one bounded multi-query search execution', () => {
    const compiler = createDefaultSourceFetcherLaneExecutionCompiler();
    const plan = xPlan();

    const result = compiler.compile(plan.lanes);

    expect(result.skippedLanes).toEqual([]);
    expect(result.executions).toHaveLength(1);
    expect(result.executions[0]).toMatchObject({
      sourceKey: 'x-twitter',
      sourceQuery: {
        mode: 'search',
        query: 'AI coding agents MCP',
        parameters: expect.objectContaining({
          maxItems: 100,
          maxSearchQueries: 5,
          searchQueries: [
            'AI coding agents MCP',
            'from:openai',
            '"Claude Code" OR "OpenAI Codex"',
            '@openai',
            'coding agents mcp claude',
          ],
        }),
      },
    });
    expect(result.executions[0]?.lanes.map((lane) => lane.kind)).toEqual([
      'general',
      'account_posts',
      'product_or_group',
      'account_mentions',
      'fallback_short_query',
    ]);
  });
});

const redditPlan = () => {
  const result = planSocialSearch({
    topic: 'AI agents MCP Claude Code reliability',
    sources: ['reddit'],
    depth: 'balanced',
    entities: {
      communities: [
        {
          name: 'ClaudeAI',
          listings: ['top', 'hot'],
          sourceKey: 'reddit',
        },
      ],
    },
  });

  if (!result.ok) {
    throw new Error('expected valid Reddit plan');
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
