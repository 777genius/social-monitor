import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { BriefingModelInput } from '../../ports';
import { DeterministicBriefingModelAdapter } from './deterministic-briefing-model.adapter';

describe('DeterministicBriefingModelAdapter', () => {
  it('keeps first-page stories and citations provider-diverse', async () => {
    const adapter = new DeterministicBriefingModelAdapter();
    const input = briefingInput();
    const route = adapter.route(input, {
      preferredProvider: 'deterministic-local',
      maxInputTokens: 24_000,
      maxOutputTokens: 2_500,
      maxEstimatedCostUsd: 1,
    }, {
      remainingTokens: 32_000,
      remainingCostUsd: 2,
    });

    const attempt = await adapter.generate(input, route);
    const citationProviders = attempt.draft.citationMap.map((citation) => citation.providerKey);

    expect(citationProviders).toContain('github-issues');
    expect(attempt.draft.topStories.some((story) => story.providerKeys.includes('github-issues'))).toBe(true);
    expect(attempt.draft.readerBrief).toBeDefined();
    expect(attempt.draft.readerBrief?.topReads.map((item) => item.providerKey)).toContain('github-issues');
  });
});

const briefingInput = (): BriefingModelInput => {
  const selectedEvidence = [
    evidenceItem('rss', 1, 1.5),
    evidenceItem('rss', 2, 1.5),
    evidenceItem('github-trending-page', 3, 1.5),
    evidenceItem('github-trending-page', 4, 1.5),
    evidenceItem('github-trending-page', 5, 1.5),
    evidenceItem('rss', 6, 1.497),
    evidenceItem('rss', 7, 1.495),
    evidenceItem('hacker-news', 8, 1.488),
    evidenceItem('reddit', 9, 1.437),
    evidenceItem('hacker-news', 10, 1.238),
    evidenceItem('reddit', 11, 1),
    evidenceItem('github-issues', 12, 1),
  ];
  const clusters = selectedEvidence.map((item) => ({
    id: `story:${item.feedItemId}`,
    storyKey: `story-key:${item.feedItemId}`,
    representativeFeedItemId: item.feedItemId,
    duplicateFeedItemIds: [],
    topicIds: [item.topicId],
    providerKeys: [item.providerKey],
    score: item.score,
    observedAtRange: {
      startedAt: item.observedAt,
      endedAt: new Date(item.observedAt.getTime() + 1),
    },
    whyImportant: item.whyImportant,
  }));

  return {
    tenantId: tenantId('tenant-deterministic-briefing-adapter'),
    workspaceId: workspaceId('workspace-deterministic-briefing-adapter'),
    scope: { type: 'workspace' },
    evidence: {
      sourceWindow: {
        windowId: 'workspace:deterministic-briefing',
        startedAt: selectedEvidence[0]?.observedAt ?? new Date('2026-06-23T08:00:00.000Z'),
        endedAt: selectedEvidence.at(-1)?.observedAt ?? new Date('2026-06-23T08:30:00.000Z'),
        selectedFeedItemIds: selectedEvidence.map((item) => item.feedItemId),
        storyClusterIds: clusters.map((cluster) => cluster.id),
      },
      clusters,
      selectedEvidence,
    },
    contextArtifacts: [],
    policy: {
      language: 'auto',
      format: 'executive_brief',
      tone: 'analytical',
      maxStories: 10,
      includeRisks: true,
      includeTopicHighlights: true,
      includeRepeatedSignals: true,
      dedupeStrategy: 'canonical_url_then_title',
      rulesVersion: 'briefing.rules.test.v1',
    },
    requestedAt: new Date('2026-06-23T08:31:00.000Z'),
  };
};

const evidenceItem = (
  providerKey: string,
  index: number,
  score: number,
): BriefingModelInput['evidence']['selectedEvidence'][number] => ({
  feedItemId: `feed-${index}`,
  sourceItemId: `source-${index}`,
  sourceBindingId: `binding-${providerKey}`,
  topicId: `topic-${index % 2}`,
  providerKey,
  canonicalUrl: `https://example.test/${providerKey}/${index}`,
  title: `${providerKey} story ${index}`,
  bodyPreview: 'Useful source evidence for a workspace briefing.',
  publishedAt: new Date(`2026-06-23T08:${String(index).padStart(2, '0')}:00.000Z`),
  observedAt: new Date(`2026-06-23T08:${String(index).padStart(2, '0')}:30.000Z`),
  score,
  whyImportant: ['Fresh item in the current monitoring window'],
});
