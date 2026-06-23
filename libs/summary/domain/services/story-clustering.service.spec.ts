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
