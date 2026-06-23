import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { BriefingArtifact, type BriefingScope } from '../../domain';
import type {
  BriefingArtifactRepositoryPort,
  BriefingFreshness,
  BriefingFreshnessProbePort,
  ListBriefingArtifactsQuery,
  ListBriefingArtifactsResult,
} from '../../ports';
import { ListBriefingsUseCase } from './list-briefings.use-case';

describe('ListBriefingsUseCase', () => {
  it('lists briefing artifacts with freshness projection', async () => {
    const artifact = briefingArtifact({ briefingId: 'briefing-1' });
    const useCase = new ListBriefingsUseCase(
      new FakeBriefingArtifactRepository([artifact]),
      new FakeBriefingFreshnessProbe(),
    );

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      scope: { type: 'workspace' },
      limit: 10,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        items: [
          expect.objectContaining({
            briefingId: 'briefing-1',
            headline: 'Workspace AI tooling briefing',
            freshness: {
              status: 'fresh',
              checkedAt: '2026-06-23T08:40:00.000Z',
            },
          }),
        ],
        nextCursor: undefined,
      },
    });
  });

  it('rejects invalid page limits before reading repositories', async () => {
    const repository = new FakeBriefingArtifactRepository([]);
    const useCase = new ListBriefingsUseCase(repository, new FakeBriefingFreshnessProbe());

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      limit: 0,
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'validation.failed' }),
    });
    expect(repository.queries).toEqual([]);
  });
});

const tenant = tenantId('tenant-briefing-list');
const workspace = workspaceId('workspace-briefing-list');

const briefingArtifact = (params: {
  readonly briefingId: string;
  readonly scope?: BriefingScope;
}): BriefingArtifact => BriefingArtifact.create({
  schemaVersion: 'briefing.artifact.v1',
  briefingId: params.briefingId,
  tenantId: tenant,
  workspaceId: workspace,
  scope: params.scope ?? { type: 'workspace' },
  sourceWindow: {
    windowId: 'workspace:list',
    startedAt: new Date('2026-06-23T08:00:00.000Z'),
    endedAt: new Date('2026-06-23T08:30:00.000Z'),
    selectedFeedItemIds: ['feed-reddit'],
    storyClusterIds: ['story:ai-tooling'],
  },
  storyClusters: [
    {
      id: 'story:ai-tooling',
      storyKey: 'url:example.com/ai-tooling',
      representativeFeedItemId: 'feed-reddit',
      duplicateFeedItemIds: ['feed-github'],
      topicIds: ['topic-ai', 'topic-github'],
      providerKeys: ['reddit', 'github'],
      score: 2.4,
      observedAtRange: {
        startedAt: new Date('2026-06-23T08:00:00.000Z'),
        endedAt: new Date('2026-06-23T08:30:00.000Z'),
      },
      whyImportant: ['Clustered 2 similar items'],
    },
  ],
  contextArtifacts: [],
  headline: 'Workspace AI tooling briefing',
  executiveSummary: 'AI tooling discussion is repeating across monitored sources.',
  topStories: [
    {
      storyClusterId: 'story:ai-tooling',
      title: 'AI tooling library is trending',
      summary: 'Developers are discussing a new AI tooling library across Reddit and GitHub.',
      topicIds: ['topic-ai', 'topic-github'],
      providerKeys: ['reddit', 'github'],
      citationIds: ['c1'],
    },
  ],
  topicHighlights: [],
  repeatedSignals: [
    {
      storyClusterId: 'story:ai-tooling',
      title: 'AI tooling library is trending',
      topicIds: ['topic-ai', 'topic-github'],
      citationIds: ['c1'],
    },
  ],
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
    score: 0.72,
    rationale: 'Evidence is clustered across two providers.',
  },
  lineage: {
    promptVersion: 'briefing.prompt.test.v1',
    schemaVersion: 'briefing.artifact.v1',
    modelVersion: 'fake-model',
    providerVersion: 'fake',
    rulesVersion: 'briefing.rules.test.v1',
    evalDatasetVersion: 'briefing.eval.test.v1',
  },
  usage: {
    inputTokens: 20,
    outputTokens: 10,
    estimatedCostUsd: 0,
  },
});

class FakeBriefingArtifactRepository implements BriefingArtifactRepositoryPort {
  readonly queries: ListBriefingArtifactsQuery[] = [];

  constructor(private readonly artifacts: readonly BriefingArtifact[]) {}

  async save(_artifact: BriefingArtifact): Promise<void> {
    return undefined;
  }

  async list(query: ListBriefingArtifactsQuery): Promise<ListBriefingArtifactsResult> {
    this.queries.push(query);
    return {
      items: this.artifacts.slice(0, query.limit),
    };
  }

  async findById(): Promise<BriefingArtifact | null> {
    return null;
  }
}

class FakeBriefingFreshnessProbe implements BriefingFreshnessProbePort {
  async evaluate(): Promise<BriefingFreshness> {
    return {
      status: 'fresh',
      checkedAt: new Date('2026-06-23T08:40:00.000Z'),
    };
  }
}
