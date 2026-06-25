import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import {
  assertBriefingCitationsAgainstEvidence,
  BriefingArtifact,
  type BriefingArtifactProps,
} from './briefing-artifact';

const baseArtifact = (overrides: Partial<BriefingArtifactProps> = {}): BriefingArtifactProps => ({
  schemaVersion: 'briefing.artifact.v1',
  briefingId: 'briefing-1',
  tenantId: tenantId('tenant-1'),
  workspaceId: workspaceId('workspace-1'),
  scope: { type: 'workspace' },
  sourceWindow: {
    windowId: 'window-1',
    startedAt: new Date('2026-06-23T08:00:00.000Z'),
    endedAt: new Date('2026-06-23T09:00:00.000Z'),
    selectedFeedItemIds: ['feed-1'],
    storyClusterIds: ['story:one'],
  },
  storyClusters: [
    {
      id: 'story:one',
      storyKey: 'url:example.com/a',
      representativeFeedItemId: 'feed-1',
      duplicateFeedItemIds: ['feed-2'],
      topicIds: ['topic-ai', 'topic-github'],
      providerKeys: ['reddit', 'github'],
      score: 2.4,
      observedAtRange: {
        startedAt: new Date('2026-06-23T08:10:00.000Z'),
        endedAt: new Date('2026-06-23T08:30:00.000Z'),
      },
      whyImportant: ['Repeated across monitored topics'],
    },
  ],
  contextArtifacts: [],
  headline: 'AI tooling is trending across sources',
  executiveSummary: 'The same AI tooling story appeared across several monitored surfaces.',
  topStories: [
    {
      storyClusterId: 'story:one',
      title: 'AI tooling is trending',
      summary: 'One story is repeated across multiple topics.',
      topicIds: ['topic-ai', 'topic-github'],
      providerKeys: ['reddit', 'github'],
      citationIds: ['citation-1'],
    },
  ],
  topicHighlights: [],
  repeatedSignals: [
    {
      storyClusterId: 'story:one',
      title: 'Repeated across AI and GitHub topics',
      topicIds: ['topic-ai', 'topic-github'],
      citationIds: ['citation-1'],
    },
  ],
  risksAndUnknowns: [],
  citationMap: [
    {
      citationId: 'citation-1',
      feedItemId: 'feed-1',
      sourceItemId: 'source-1',
      providerKey: 'reddit',
      field: 'title',
    },
  ],
  qualityFlags: [],
  confidence: {
    level: 'medium',
    score: 0.64,
    rationale: 'Direct source item citation with repeated topic coverage.',
  },
  lineage: {
    promptVersion: 'briefing.prompt.v1',
    schemaVersion: 'briefing.artifact.v1',
    modelVersion: 'deterministic-briefing-v1',
    providerVersion: 'deterministic-local',
    rulesVersion: 'briefing.rules.policy.v1',
    evalDatasetVersion: 'briefing.eval.v1',
  },
  usage: {
    inputTokens: 10,
    outputTokens: 20,
    estimatedCostUsd: 0,
  },
  ...overrides,
});

describe('BriefingArtifact', () => {
  it('accepts a workspace briefing with story clusters and feed citations', () => {
    expect(BriefingArtifact.create(baseArtifact()).toSnapshot()).toMatchObject({
      schemaVersion: 'briefing.artifact.v1',
      briefingId: 'briefing-1',
      scope: { type: 'workspace' },
      topStories: [
        expect.objectContaining({
          storyClusterId: 'story:one',
          citationIds: ['citation-1'],
        }),
      ],
    });
  });

  it('rejects top stories that cite outside the citation map', () => {
    expect(() => BriefingArtifact.create(baseArtifact({
      topStories: [
        {
          storyClusterId: 'story:one',
          title: 'Untrusted story',
          summary: 'This cites a missing source.',
          topicIds: ['topic-ai'],
          providerKeys: ['reddit'],
          citationIds: ['missing-citation'],
        },
      ],
    }))).toThrow('Briefing top story cites evidence outside citation map');
  });

  it('rejects repeated signals that do not cross at least two topics', () => {
    expect(() => BriefingArtifact.create(baseArtifact({
      repeatedSignals: [
        {
          storyClusterId: 'story:one',
          title: 'Not actually repeated',
          topicIds: ['topic-ai'],
          citationIds: ['citation-1'],
        },
      ],
    }))).toThrow('Briefing repeated signal must cover at least two topics');
  });

  it('rejects model citations outside selected primary evidence', () => {
    expect(() => assertBriefingCitationsAgainstEvidence(
      {
        citationMap: [
          {
            citationId: 'citation-1',
            feedItemId: 'feed-outside',
            sourceItemId: 'source-outside',
            providerKey: 'reddit',
            field: 'title',
          },
        ],
        topStories: [],
        topicHighlights: [],
        repeatedSignals: [],
        risksAndUnknowns: [],
      },
      {
        rankingPolicyVersion: 'story_ranking_v1',
        sourceWindow: {
          windowId: 'window-1',
          startedAt: new Date('2026-06-23T08:00:00.000Z'),
          endedAt: new Date('2026-06-23T09:00:00.000Z'),
          selectedFeedItemIds: ['feed-1'],
          storyClusterIds: ['story:one'],
        },
        clusters: [],
        selectedEvidence: [],
      },
    )).toThrow('Briefing citation citation-1 references evidence outside selection');
  });
});
