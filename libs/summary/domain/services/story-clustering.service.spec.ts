import { tenantId, workspaceId, type Clock } from '@social-monitor/shared-kernel';

import { StoryClusteringService } from './story-clustering.service';
import type { BriefingEvidenceItem } from '../value-objects/briefing-evidence-item';

const clock: Clock = {
  now: () => new Date('2026-06-23T09:00:00.000Z'),
};

const evidenceItem = (overrides: Partial<BriefingEvidenceItem>): BriefingEvidenceItem => ({
  feedItemId: 'feed-1',
  sourceItemId: 'source-1',
  sourceBindingId: 'binding-1',
  topicId: 'topic-ai',
  providerKey: 'reddit',
  canonicalUrl: 'https://example.com/stories/ai-tooling?utm_source=reddit',
  title: 'AI tooling launch',
  bodyPreview: 'A new AI tooling library is trending.',
  publishedAt: new Date('2026-06-23T08:00:00.000Z'),
  observedAt: new Date('2026-06-23T08:05:00.000Z'),
  score: 1.5,
  whyImportant: ['Fresh item in the current monitoring window'],
  ...overrides,
});

describe('StoryClusteringService', () => {
  it('clusters the same canonical URL across topics and providers', () => {
    const service = new StoryClusteringService(clock);

    const selection = service.cluster({
      identity: {
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        scope: { type: 'workspace' },
      },
      limit: 10,
      items: [
        evidenceItem({
          feedItemId: 'feed-reddit',
          topicId: 'topic-ai',
          providerKey: 'reddit',
          score: 1.8,
        }),
        evidenceItem({
          feedItemId: 'feed-github',
          sourceItemId: 'source-2',
          topicId: 'topic-github',
          providerKey: 'github',
          canonicalUrl: 'https://example.com/stories/ai-tooling#discussion',
          score: 2.2,
        }),
      ],
    });

    expect(selection.clusters).toHaveLength(1);
    expect(selection.clusters[0]).toMatchObject({
      representativeFeedItemId: 'feed-github',
      duplicateFeedItemIds: ['feed-reddit'],
      topicIds: ['topic-ai', 'topic-github'],
      providerKeys: ['github', 'reddit'],
    });
    expect(selection.sourceWindow.selectedFeedItemIds).toEqual(['feed-github']);
  });

  it('uses a GitHub repository as the canonical entity across discussion sources', () => {
    const service = new StoryClusteringService(clock);

    const selection = service.cluster({
      identity: {
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        scope: { type: 'workspace' },
      },
      limit: 10,
      items: [
        evidenceItem({
          feedItemId: 'feed-repo',
          providerKey: 'github-repo-radar',
          canonicalUrl: 'https://github.com/OpenAI/Codex?utm_source=radar',
          title: 'openai/codex',
          score: 2.2,
          storyKeyHint: 'url:github.com/openai/codex?source=old',
        }),
        evidenceItem({
          feedItemId: 'feed-reddit',
          sourceItemId: 'reddit-1',
          providerKey: 'reddit',
          canonicalUrl: 'https://www.reddit.com/r/programming/comments/1/why_openai_codex_matters',
          title: 'Why openai/codex is suddenly everywhere',
          score: 1.7,
          storyKeyHint: 'reddit:discussion-1',
        }),
      ],
    });

    expect(selection.clusters).toHaveLength(1);
    expect(selection.clusters[0]).toMatchObject({
      storyKey: 'github-repo:openai/codex',
      representativeFeedItemId: 'feed-repo',
      duplicateFeedItemIds: ['feed-reddit'],
      providerKeys: ['github-repo-radar', 'reddit'],
    });
  });

  it('returns a deterministic empty source window for no evidence', () => {
    const service = new StoryClusteringService(clock);

    const selection = service.cluster({
      identity: {
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        scope: { type: 'workspace' },
      },
      limit: 10,
      items: [],
    });

    expect(selection.sourceWindow).toMatchObject({
      selectedFeedItemIds: [],
      storyClusterIds: [],
    });
    expect(selection.sourceWindow.endedAt.getTime()).toBeGreaterThan(selection.sourceWindow.startedAt.getTime());
  });
});
