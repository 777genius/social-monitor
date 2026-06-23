import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { BriefingArtifact } from '../../domain';
import type {
  BriefingArtifactRepositoryPort,
  BriefingFreshness,
  BriefingFreshnessProbePort,
  ListBriefingArtifactsQuery,
  ListBriefingArtifactsResult,
} from '../../ports';
import { GetBriefingUseCase } from './get-briefing.use-case';

describe('GetBriefingUseCase', () => {
  it('loads a briefing artifact by id with freshness projection', async () => {
    const useCase = new GetBriefingUseCase(
      new FakeBriefingArtifactRepository([briefingArtifact('briefing-1')]),
      new FakeBriefingFreshnessProbe(),
    );

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      briefingId: 'briefing-1',
    });

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        briefingId: 'briefing-1',
        headline: 'Workspace AI tooling briefing',
        citations: [
          expect.objectContaining({
            citationId: 'c1',
            label: '[1]',
            feedItemId: 'feed-reddit',
          }),
        ],
      }),
    });
  });

  it('returns not found for missing briefing artifacts', async () => {
    const useCase = new GetBriefingUseCase(
      new FakeBriefingArtifactRepository([]),
      new FakeBriefingFreshnessProbe(),
    );

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      briefingId: 'missing',
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'resource.not_found' }),
    });
  });
});

const tenant = tenantId('tenant-briefing-get');
const workspace = workspaceId('workspace-briefing-get');

const briefingArtifact = (briefingId: string): BriefingArtifact => BriefingArtifact.create({
  schemaVersion: 'briefing.artifact.v1',
  briefingId,
  tenantId: tenant,
  workspaceId: workspace,
  scope: { type: 'workspace' },
  sourceWindow: {
    windowId: 'workspace:get',
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
  constructor(private readonly artifacts: readonly BriefingArtifact[]) {}

  async save(_artifact: BriefingArtifact): Promise<void> {
    return undefined;
  }

  async list(_query: ListBriefingArtifactsQuery): Promise<ListBriefingArtifactsResult> {
    return { items: this.artifacts };
  }

  async findById(params: Parameters<BriefingArtifactRepositoryPort['findById']>[0]): Promise<BriefingArtifact | null> {
    return this.artifacts.find((artifact) => {
      const snapshot = artifact.toSnapshot();
      return (
        snapshot.tenantId === params.tenantId &&
        snapshot.workspaceId === params.workspaceId &&
        snapshot.briefingId === params.briefingId
      );
    }) ?? null;
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
