import type {
  FetchSourceItemsCommand,
  FetchSourceItemsResult,
  SourceFetcherPort,
} from '@social-monitor/ingestion/ports';
import type {
  SocialResearchExecutionPolicyPort,
  SocialThreadReaderPort,
} from '@social-monitor/social-research';

import { buildSocialResearchMcpServer } from './social-research-mcp-server';

describe('buildSocialResearchMcpServer', () => {
  it('creates a real MCP server with the social research tools registered', () => {
    const server = buildSocialResearchMcpServer();
    const registeredTools = (
      server as unknown as {
        readonly _registeredTools: Readonly<Record<string, unknown>>;
      }
    )._registeredTools;

    expect(Object.keys(registeredTools)).toEqual([
      'search_social',
      'explain_search_plan',
      'fetch_thread',
      'rank_results',
      'list_social_sources',
      'explain_source_readiness',
    ]);
  });

  it('wires search_social to a provided SourceFetcherPort through the SDK gateway', async () => {
    const sourceFetcher = new CapturingSourceFetcher();
    const server = buildSocialResearchMcpServer({ sourceFetcher });
    const result = await registeredTool(server, 'search_social').handler({
      topic: 'AI agents MCP',
      sources: ['reddit'],
      depth: 'light',
      execution: {
        tenantId: 'tenant-social-research-mcp',
        workspaceId: 'workspace-social-research-mcp',
        scanJobId: 'scan-social-research-mcp',
        sourceBindingIdBySource: {
          reddit: 'source-binding-reddit',
        },
      },
    });

    expect(result.isError).not.toBe(true);
    expect(sourceFetcher.calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          providerKey: 'reddit',
          sourceBindingId: 'source-binding-reddit',
        }),
      ]),
    );
    expect(JSON.parse(result.content[0]?.text ?? '{}')).toEqual(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            itemId: 'reddit:t3_mcp',
            sourceKey: 'reddit',
          }),
        ],
      }),
    );
  });

  it('rejects ambiguous handler and runtime dependency configuration', () => {
    expect(() =>
      buildSocialResearchMcpServer({
        handlers: {} as never,
        sourceFetcher: new CapturingSourceFetcher(),
      }),
    ).toThrow('Provide either explicit social research handlers');
  });

  it('wires fetch_thread to a configured thread reader with execution scope', async () => {
    const threadReader = new CapturingThreadReader();
    const server = buildSocialResearchMcpServer({
      sourceFetcher: new CapturingSourceFetcher(),
      threadReader,
    });
    const result = await registeredTool(server, 'fetch_thread').handler({
      sourceKey: 'reddit',
      externalId: 'reddit:t3_thread',
      maxDepth: 2,
      execution: {
        tenantId: 'tenant-social-research-mcp',
        workspaceId: 'workspace-social-research-mcp',
        scanJobId: 'scan-social-research-mcp',
        sourceBindingIdBySource: {
          reddit: 'source-binding-reddit',
        },
      },
    });

    expect(result.isError).not.toBe(true);
    expect(threadReader.calls).toEqual(['source-binding-reddit']);
    expect(JSON.parse(result.content[0]?.text ?? '{}')).toEqual(
      expect.objectContaining({
        root: expect.objectContaining({
          itemId: 'reddit:t3_thread',
        }),
      }),
    );
  });

  it('rejects thread reader wiring without SourceFetcherPort-backed gateway', () => {
    expect(() =>
      buildSocialResearchMcpServer({
        threadReader: new CapturingThreadReader(),
      }),
    ).toThrow('Thread reader wiring requires a SourceFetcherPort');
  });

  it('applies an injected execution policy before provider execution', async () => {
    const sourceFetcher = new CapturingSourceFetcher();
    const server = buildSocialResearchMcpServer({
      sourceFetcher,
      executionPolicy: {
        async authorizeSearch() {
          return {
            allowed: false,
            reason: 'quota exhausted',
          };
        },
        async authorizeThreadFetch() {
          return { allowed: true };
        },
      } satisfies SocialResearchExecutionPolicyPort,
    });
    const result = await registeredTool(server, 'search_social').handler({
      topic: 'AI agents MCP',
      sources: ['reddit'],
      execution: {
        tenantId: 'tenant-social-research-mcp',
        workspaceId: 'workspace-social-research-mcp',
        scanJobId: 'scan-social-research-mcp',
        sourceBindingIdBySource: {
          reddit: 'source-binding-reddit',
        },
      },
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('quota exhausted');
    expect(sourceFetcher.calls).toEqual([]);
  });
});

type RegisteredTool = {
  readonly handler: (
    input: unknown,
  ) => Promise<{
    readonly content: readonly { readonly text: string }[];
    readonly isError?: boolean;
  }>;
};

const registeredTool = (server: unknown, name: string): RegisteredTool => {
  const registeredTools = (
    server as {
      readonly _registeredTools: Readonly<Record<string, RegisteredTool>>;
    }
  )._registeredTools;

  const tool = registeredTools[name];
  if (tool === undefined) {
    throw new Error(`Tool is not registered: ${name}`);
  }

  return tool;
};

class CapturingSourceFetcher implements SourceFetcherPort {
  readonly calls: FetchSourceItemsCommand[] = [];

  async fetch(command: FetchSourceItemsCommand): Promise<FetchSourceItemsResult> {
    this.calls.push(command);

    return {
      items: [
        {
          externalId: 'reddit:t3_mcp',
          canonicalUrl: 'https://www.reddit.com/r/LocalLLaMA/comments/mcp',
          title: 'MCP agent discussion',
          body: 'People compare MCP agent workflows.',
          authorHandle: 'researcher',
          publishedAt: new Date('2026-07-04T12:00:00.000Z'),
          metadata: {
            score: 42,
            comments: 7,
          },
        },
      ],
    };
  }
}

class CapturingThreadReader implements SocialThreadReaderPort {
  readonly calls: string[] = [];

  async fetchThread(
    command: Parameters<SocialThreadReaderPort['fetchThread']>[0],
  ): ReturnType<SocialThreadReaderPort['fetchThread']> {
    this.calls.push(
      command.execution.sourceBindingIdBySource.reddit ?? 'missing',
    );

    return {
      root: {
        itemId: command.externalId ?? 'thread-root',
        sourceKey: command.sourceKey ?? 'reddit',
        canonicalUrl: 'https://www.reddit.com/r/test/comments/thread',
        title: 'Thread root',
        body: 'Thread body',
      },
      units: [],
      warnings: [],
    };
  }
}
