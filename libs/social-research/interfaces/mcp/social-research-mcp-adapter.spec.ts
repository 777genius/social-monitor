import type {
  SocialResearchMcpToolConfig,
  SocialResearchMcpToolResult,
  SocialResearchMcpToolRegistrar,
} from './social-research-mcp-adapter';
import { registerSocialResearchMcpTools } from './social-research-mcp-adapter';

describe('registerSocialResearchMcpTools', () => {
  it('registers the SDK-backed MCP tools', () => {
    const registrar = new FakeMcpRegistrar();

    registerSocialResearchMcpTools(registrar);

    expect(registrar.names()).toEqual([
      'search_social',
      'explain_search_plan',
      'fetch_thread',
      'rank_results',
      'list_social_sources',
      'explain_source_readiness',
    ]);
    expect(registrar.tool('search_social')?.config.description).toContain(
      'Social Monitor SDK',
    );
  });

  it('returns JSON text content from explain_search_plan', async () => {
    const registrar = new FakeMcpRegistrar();
    registerSocialResearchMcpTools(registrar);

    const result = await registrar.call('explain_search_plan', {
      topic: 'AI coding agents',
      sources: ['x-twitter'],
      entities: {
        handles: ['openai'],
      },
    });
    const body = JSON.parse(result.content[0]?.text ?? '{}') as {
      readonly explanation?: string;
      readonly plan?: { readonly lanes?: readonly { readonly kind: string }[] };
    };

    expect(result.isError).toBeUndefined();
    expect(body.explanation).toContain('x-twitter/account_posts: from:openai');
    expect(body.plan?.lanes?.map((lane) => lane.kind)).toEqual(
      expect.arrayContaining(['general', 'account_posts', 'account_mentions']),
    );
  });

  it('converts validation failures into MCP error results', async () => {
    const registrar = new FakeMcpRegistrar();
    registerSocialResearchMcpTools(registrar);

    const result = await registrar.call('rank_results', {
      topic: '',
      items: [],
    });
    const body = JSON.parse(result.content[0]?.text ?? '{}') as {
      readonly error?: { readonly message?: string };
    };

    expect(result.isError).toBe(true);
    expect(body.error?.message).toContain('Too small');
  });

  it('returns JSON text content from explain_source_readiness', async () => {
    const registrar = new FakeMcpRegistrar();
    registerSocialResearchMcpTools(registrar);

    const result = await registrar.call('explain_source_readiness', {
      sourceKey: 'x-twitter',
    });
    const body = JSON.parse(result.content[0]?.text ?? '{}') as {
      readonly canExecuteWithDefaultPolicy?: boolean;
      readonly source?: { readonly sourceKey?: string };
    };

    expect(result.isError).toBeUndefined();
    expect(body.source?.sourceKey).toBe('x-twitter');
    expect(body.canExecuteWithDefaultPolicy).toBe(false);
  });
});

type RegisteredTool = {
  readonly config: SocialResearchMcpToolConfig;
  readonly handler: (input: unknown) => Promise<SocialResearchMcpToolResult>;
};

class FakeMcpRegistrar implements SocialResearchMcpToolRegistrar {
  private readonly tools = new Map<string, RegisteredTool>();

  registerTool(
    name: string,
    config: SocialResearchMcpToolConfig,
    handler: (input: unknown) => Promise<SocialResearchMcpToolResult>,
  ): void {
    this.tools.set(name, { config, handler });
  }

  names(): readonly string[] {
    return [...this.tools.keys()];
  }

  tool(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  async call(
    name: string,
    input: unknown,
  ): Promise<SocialResearchMcpToolResult> {
    const tool = this.tools.get(name);
    if (tool === undefined) {
      throw new Error(`Tool not registered: ${name}`);
    }

    return tool.handler(input);
  }
}
