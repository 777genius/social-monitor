import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { SourceBinding, Interest } from '../../domain';
import type {
  ListSourceBindingsQuery,
  ListSourceBindingsResult,
  ListInterestsQuery,
  ListInterestsResult,
  SourceBindingConfig,
  SourceBindingConfigValidationResult,
  SourceBindingRepositoryPort,
  SourceCapabilityProfile,
  SourceCatalogPort,
  InterestRepositoryPort,
} from '../../ports';
import { PlanInterestCoverageUseCase } from './plan-interest-coverage.use-case';

class FakeInterests implements InterestRepositoryPort {
  private readonly interests = new Map<string, Interest>();

  add(interest: Interest): void {
    const snapshot = interest.toSnapshot();
    this.interests.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`, interest);
  }

  async save(interest: Interest): Promise<void> {
    this.add(interest);
  }

  async findByName(): Promise<Interest | null> {
    return null;
  }

  async findById(params: Parameters<InterestRepositoryPort['findById']>[0]): Promise<Interest | null> {
    return this.interests.get(`${params.tenantId}:${params.workspaceId}:${params.interestId}`) ?? null;
  }

  async list(query: ListInterestsQuery): Promise<ListInterestsResult> {
    return {
      interests: [...this.interests.values()].filter((interest) => {
        const snapshot = interest.toSnapshot();

        return snapshot.tenantId === query.tenantId && snapshot.workspaceId === query.workspaceId;
      }),
      nextCursor: undefined,
    };
  }
}

class FakeSourceBindings implements SourceBindingRepositoryPort {
  private readonly bindings = new Map<string, SourceBinding>();

  add(binding: SourceBinding): void {
    const snapshot = binding.toSnapshot();
    this.bindings.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`, binding);
  }

  async save(binding: SourceBinding): Promise<void> {
    this.add(binding);
  }

  async findByInterestAndProvider(): Promise<SourceBinding | null> {
    return null;
  }

  async findById(params: Parameters<SourceBindingRepositoryPort['findById']>[0]): Promise<SourceBinding | null> {
    return this.bindings.get(`${params.tenantId}:${params.workspaceId}:${params.sourceBindingId}`) ?? null;
  }

  async listByInterest(query: ListSourceBindingsQuery): Promise<ListSourceBindingsResult> {
    return {
      sourceBindings: [...this.bindings.values()].filter((binding) => {
        const snapshot = binding.toSnapshot();

        return (
          snapshot.tenantId === query.tenantId &&
          snapshot.workspaceId === query.workspaceId &&
          snapshot.interestId === query.interestId
        );
      }),
      nextCursor: undefined,
    };
  }
}

class FakeCatalog implements SourceCatalogPort {
  readonly validatedConfigs: SourceBindingConfig[] = [];

  constructor(private readonly invalidProviderKeys = new Set<string>()) {}

  async getCapability(providerKey: string): Promise<SourceCapabilityProfile | null> {
    if (this.invalidProviderKeys.has(providerKey)) {
      return null;
    }

    return {
      providerKey,
      version: 1,
      productionSafe: true,
      supportsCursor: true,
    };
  }

  async validateBindingConfig(
    providerKey: string,
    config: SourceBindingConfig,
  ): Promise<SourceBindingConfigValidationResult> {
    this.validatedConfigs.push(config);

    return this.invalidProviderKeys.has(providerKey)
      ? { ok: false, reason: 'invalid provider config' }
      : { ok: true };
  }
}

const scope = {
  tenantId: tenantId('tenant-1'),
  workspaceId: workspaceId('workspace-1'),
};

const makeInterest = () =>
  Interest.create({
    ...scope,
    id: 'interest-1',
    name: 'AI devtools',
    query: 'agent observability',
    createdAt: new Date('2026-06-29T00:00:00.000Z'),
  });

describe('PlanInterestCoverageUseCase', () => {
  it('plans executable Reddit scan passes from keyword and subreddit hints', async () => {
    const interests = new FakeInterests();
    interests.add(makeInterest());
    const catalog = new FakeCatalog();
    const useCase = new PlanInterestCoverageUseCase(interests, new FakeSourceBindings(), catalog);

    const result = await useCase.execute({
      ...scope,
      interestId: 'interest-1',
      keywords: ['LLM monitoring'],
      subreddits: ['r/startups', 'ArtificialInteligence!', 'SaaS'],
      includeProviders: ['reddit'],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.planningQuery).toContain('"LLM monitoring"');
    expect(result.value.drafts).toHaveLength(1);

    const [redditDraft] = result.value.drafts;
    expect(redditDraft?.status).toBe('ready');
    expect(redditDraft?.sourceBindingDraft?.config).toMatchObject({
      mode: 'search',
      maxItems: 60,
      subreddits: ['SaaS', 'startups'],
    });
    expect(redditDraft?.sourceBindingDraft?.config.scanPasses).toEqual([
      expect.objectContaining({ mode: 'search', query: expect.stringContaining('"LLM monitoring"'), includeComments: true }),
      expect.objectContaining({ mode: 'listing', subreddit: 'SaaS', listing: 'new', includeComments: true }),
      expect.objectContaining({ mode: 'listing', subreddit: 'SaaS', listing: 'top', topTime: 'week', includeComments: true }),
      expect.objectContaining({ mode: 'listing', subreddit: 'startups', listing: 'new', includeComments: true }),
      expect.objectContaining({ mode: 'listing', subreddit: 'startups', listing: 'top', topTime: 'week', includeComments: true }),
    ]);
    expect(redditDraft?.warnings).toContain(
      'Ignored invalid subreddit hints: ArtificialInteligence!.',
    );
    expect(redditDraft?.warnings).toContain(
      'Reddit keyword-wide comment search is not used; comments are collected from matched post threads through official OAuth endpoints.',
    );
    expect(redditDraft?.applyTarget?.path).toBe('/interests/interest-1/source-bindings');
  });

  it('marks provider drafts as already bound without an apply target', async () => {
    const interests = new FakeInterests();
    interests.add(makeInterest());
    const bindings = new FakeSourceBindings();
    bindings.add(SourceBinding.create({
      ...scope,
      id: 'binding-reddit',
      interestId: 'interest-1',
      providerKey: 'reddit',
      capabilityProfileVersion: 1,
      config: { mode: 'search', query: 'agent observability' },
      createdAt: new Date('2026-06-29T00:00:00.000Z'),
    }));
    const useCase = new PlanInterestCoverageUseCase(interests, bindings, new FakeCatalog());

    const result = await useCase.execute({
      ...scope,
      interestId: 'interest-1',
      includeProviders: ['reddit'],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.drafts[0]).toMatchObject({
      providerKey: 'reddit',
      status: 'already_bound',
      existingSourceBindingId: 'binding-reddit',
    });
    expect(result.value.drafts[0]?.applyTarget).toBeUndefined();
  });

  it('plans Hacker News story and comment search in one provider draft', async () => {
    const interests = new FakeInterests();
    interests.add(makeInterest());
    const useCase = new PlanInterestCoverageUseCase(interests, new FakeSourceBindings(), new FakeCatalog());

    const result = await useCase.execute({
      ...scope,
      interestId: 'interest-1',
      includeProviders: ['hacker-news'],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.drafts[0]?.sourceBindingDraft?.config).toMatchObject({
      mode: 'search',
      maxItems: 60,
      scanPasses: [
        expect.objectContaining({ mode: 'search', target: 'story' }),
        expect.objectContaining({ mode: 'search', target: 'comment' }),
      ],
    });
    expect(result.value.coverageGaps).not.toContain(
      'Hacker News comment search is a runtime gap: the current provider searches stories only.',
    );
  });

  it('suggests a broad RSS search feed when no curated feed URLs are provided', async () => {
    const interests = new FakeInterests();
    interests.add(makeInterest());
    const useCase = new PlanInterestCoverageUseCase(interests, new FakeSourceBindings(), new FakeCatalog());

    const result = await useCase.execute({
      ...scope,
      interestId: 'interest-1',
      includeProviders: ['rss'],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.drafts[0]).toMatchObject({
      providerKey: 'rss',
      status: 'ready',
    });
    expect(result.value.drafts[0]?.sourceBindingDraft?.config.feedUrl).toContain(
      'https://news.google.com/rss/search?',
    );
    expect(result.value.drafts[0]?.warnings).toContain(
      'Generated RSS feed is broad news coverage; replace with official blog, changelog, docs or community feeds when available.',
    );
  });

  it('returns interest not found when planning an unknown interest', async () => {
    const result = await new PlanInterestCoverageUseCase(
      new FakeInterests(),
      new FakeSourceBindings(),
      new FakeCatalog(),
    ).execute({
      ...scope,
      interestId: 'missing-interest',
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('resource.not_found');
  });
});
