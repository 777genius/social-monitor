import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type {
  SummaryEvidenceSelection,
  SummaryEvidenceSelectorPort,
  YoutubeVideoSummaryProviderPort,
  YoutubeVideoSummaryRequest,
  YoutubeVideoSummaryResult,
} from '../../ports';
import { YoutubeVideoSummaryEvidenceSelector } from './youtube-video-summary-evidence.selector';

class StaticEvidenceSelector implements SummaryEvidenceSelectorPort {
  constructor(private readonly selection: SummaryEvidenceSelection) {}

  async select(): Promise<SummaryEvidenceSelection> {
    return this.selection;
  }
}

class RecordingYoutubeVideoSummaryProvider implements YoutubeVideoSummaryProviderPort {
  readonly providerName = 'test-youtube-provider';
  readonly requests: YoutubeVideoSummaryRequest[] = [];

  supports(url: string): boolean {
    return url.includes('youtube.com/watch');
  }

  async summarize(request: YoutubeVideoSummaryRequest): Promise<YoutubeVideoSummaryResult> {
    this.requests.push(request);

    return {
      provider: this.providerName,
      model: 'test-video-model',
      promptVersion: 'youtube.video.summary.test.v1',
      summary: 'Video explains the launch and open questions.',
      keyPoints: ['Launch timeline', 'Open questions'],
      chapters: [
        {
          startTime: '01:20',
          title: 'Launch details',
          summary: 'The video describes launch timing.',
        },
      ],
      followUpQuestions: ['What changed since the previous update?'],
      confidence: {
        level: 'medium',
        score: 0.7,
        rationale: 'Test confidence.',
      },
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        estimatedCostUsd: 0.01,
      },
    };
  }
}

describe('YoutubeVideoSummaryEvidenceSelector', () => {
  it('adds provider summaries to YouTube evidence without changing non-YouTube evidence', async () => {
    const provider = new RecordingYoutubeVideoSummaryProvider();
    const selector = new YoutubeVideoSummaryEvidenceSelector(new StaticEvidenceSelector(baseSelection()), provider);

    const selection = await selector.select({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      interestId: 'interest-1',
      maxItems: 20,
    });

    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0]).toMatchObject({
      feedItemId: 'feed-youtube',
      sourceItemId: 'source-youtube',
      url: 'https://www.youtube.com/watch?v=9hE5-98ZeCg',
    });
    expect(selection.items[0]?.bodyPreview).toContain('YouTube video summary');
    expect(selection.items[0]?.bodyPreview).toContain('Video explains the launch');
    expect(selection.items[0]?.extractedSummaries?.[0]).toMatchObject({
      kind: 'youtube_video_summary',
      provider: 'test-youtube-provider',
      model: 'test-video-model',
      confidenceScore: 0.7,
    });
    expect(selection.items[1]?.bodyPreview).toBe('Article preview');
    expect(selection.items[1]?.extractedSummaries).toBeUndefined();
  });

  it('keeps original evidence when provider fails and fail-open is enabled', async () => {
    const provider: YoutubeVideoSummaryProviderPort = {
      providerName: 'broken-provider',
      supports: () => true,
      summarize: async () => {
        throw new Error('provider unavailable');
      },
    };
    const selector = new YoutubeVideoSummaryEvidenceSelector(new StaticEvidenceSelector(baseSelection()), provider);

    const selection = await selector.select({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      interestId: 'interest-1',
      maxItems: 20,
    });

    expect(selection).toEqual(baseSelection());
  });
});

const baseSelection = (): SummaryEvidenceSelection => ({
  sourceWindow: {
    windowId: 'window-1',
    startedAt: new Date('2026-06-21T00:00:00.000Z'),
    endedAt: new Date('2026-06-21T00:01:00.000Z'),
    selectedFeedItemIds: ['feed-youtube', 'feed-article'],
  },
  items: [
    {
      feedItemId: 'feed-youtube',
      sourceItemId: 'source-youtube',
      sourceBindingId: 'binding-youtube',
      providerKey: 'youtube',
      title: 'Launch video',
      bodyPreview: 'Existing preview',
      canonicalUrl: 'https://www.youtube.com/watch?v=9hE5-98ZeCg',
      observedAt: new Date('2026-06-21T00:00:10.000Z'),
    },
    {
      feedItemId: 'feed-article',
      sourceItemId: 'source-article',
      sourceBindingId: 'binding-article',
      providerKey: 'rss',
      title: 'Launch article',
      bodyPreview: 'Article preview',
      canonicalUrl: 'https://example.com/launch',
      observedAt: new Date('2026-06-21T00:00:20.000Z'),
    },
  ],
});
