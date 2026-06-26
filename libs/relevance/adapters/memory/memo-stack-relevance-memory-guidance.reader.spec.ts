import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { MemoStackRelevanceMemoryGuidanceReader } from './memo-stack-relevance-memory-guidance.reader';

describe('MemoStackRelevanceMemoryGuidanceReader', () => {
  it('builds bounded ranking guidance from user preference memory context', async () => {
    const client = new CapturingMemoStackContextClient({
      data: {
        rendered_text: [
          'Guidance: prefer similar github evidence and topic signals for this user.',
          'Ranking quality signal: positive_relevance.',
          'Provider github was involved.',
          'Guidance: avoid rss evidence for this user unless explicitly requested.',
        ].join(' '),
        diagnostics: {
          facts_used: 2,
        },
      },
    });
    const reader = new MemoStackRelevanceMemoryGuidanceReader({
      baseUrl: 'https://memory.example',
      token: 'memory-token',
      client,
    });

    const result = await reader.buildGuidance({
      tenantId: tenantId('tenant-memory-guidance'),
      workspaceId: workspaceId('workspace-memory-guidance'),
      userId: 'user-memory-guidance',
      providerKeys: ['github', 'rss', 'reddit'],
      keywords: ['orchestration', 'github', 'access_token'],
      requestedAt: new Date('2026-06-22T10:00:00.000Z'),
    });

    expect(result).toEqual(expect.objectContaining({
      status: 'available',
      providerPreferences: [{ key: 'github', weight: 1 }],
      blockedProviderKeys: ['rss'],
    }));
    expect(result.keywordPreferences).toEqual(
      expect.arrayContaining([{ key: 'github', weight: 0.5 }]),
    );
    expect(client.requests[0]).toEqual(expect.objectContaining({
      spaceSlug: 'social-monitor:tenant-memory-guidance:workspace-memory-guidance',
      memoryScopeExternalRefs: ['user:user-memory-guidance:preferences'],
      maxChunks: 0,
      includeStale: false,
    }));
    expect(client.requests[0]?.query).not.toContain('access_token');
    expect(client.requests[0]?.query).not.toContain('user-memory-guidance');
  });

  it('fails open when memo-stack guidance is unavailable', async () => {
    const reader = new MemoStackRelevanceMemoryGuidanceReader({
      baseUrl: 'https://memory.example',
      token: 'memory-token',
      client: new FailingMemoStackContextClient(),
    });

    await expect(reader.buildGuidance({
      tenantId: tenantId('tenant-memory-guidance-fail'),
      workspaceId: workspaceId('workspace-memory-guidance-fail'),
      userId: 'user-memory-guidance-fail',
      providerKeys: ['github'],
      keywords: ['agents'],
      requestedAt: new Date('2026-06-22T10:00:00.000Z'),
    })).resolves.toEqual(expect.objectContaining({
      status: 'unavailable',
    }));
  });

  it('uses summary feedback user-preference facts as provider downrank guidance', async () => {
    const client = new CapturingMemoStackContextClient({
      data: {
        rendered_text: [
          'User summary preference for topic topic-ai: rating 2/5, category bad_citation.',
          'Guidance: down-rank similar github evidence unless stronger corroboration exists.',
        ].join(' '),
        diagnostics: {
          facts_used: 1,
        },
      },
    });
    const reader = new MemoStackRelevanceMemoryGuidanceReader({
      baseUrl: 'https://memory.example',
      token: 'memory-token',
      client,
    });

    const result = await reader.buildGuidance({
      tenantId: tenantId('tenant-summary-feedback-guidance'),
      workspaceId: workspaceId('workspace-summary-feedback-guidance'),
      userId: 'user-summary-feedback-guidance',
      providerKeys: ['github', 'reddit'],
      keywords: ['corroboration', 'github'],
      requestedAt: new Date('2026-06-22T10:00:00.000Z'),
    });

    expect(result).toEqual(expect.objectContaining({
      status: 'available',
      providerPreferences: [{ key: 'github', weight: -1 }],
      blockedProviderKeys: [],
    }));
    expect(result.keywordPreferences).toEqual(expect.arrayContaining([
      { key: 'corroboration', weight: 0.5 },
    ]));
  });
});

class CapturingMemoStackContextClient {
  readonly requests: Array<{ readonly query?: string } & Readonly<Record<string, unknown>>> = [];
  readonly context = {
    buildContext: async (request: { readonly query?: string } & Readonly<Record<string, unknown>>): Promise<unknown> => {
      this.requests.push(request);

      return this.response;
    },
  };

  constructor(private readonly response: unknown) {}
}

class FailingMemoStackContextClient {
  readonly context = {
    buildContext: async (): Promise<unknown> => {
      throw new Error('memo-stack unavailable');
    },
  };
}
