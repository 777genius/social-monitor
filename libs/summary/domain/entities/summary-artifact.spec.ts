import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { SummaryArtifact, type SummaryArtifactProps } from './summary-artifact';

const baseArtifact = (overrides: Partial<SummaryArtifactProps> = {}): SummaryArtifactProps => ({
  schemaVersion: 'summary.artifact.v1',
  summaryId: 'summary-1',
  tenantId: tenantId('tenant-1'),
  workspaceId: workspaceId('workspace-1'),
  topicId: 'topic-1',
  sourceWindow: {
    windowId: 'window-1',
    startedAt: new Date('2026-06-06T00:00:00.000Z'),
    endedAt: new Date('2026-06-06T01:00:00.000Z'),
    selectedFeedItemIds: ['feed-1'],
  },
  headline: 'Summary headline',
  executiveSummary: 'Summary text with evidence.',
  keyPoints: [
    {
      claim: 'A cited claim.',
      citationIds: ['citation-1'],
    },
  ],
  risksAndUnknowns: [],
  sourceHighlights: ['feed-1'],
  citationMap: [
    {
      citationId: 'citation-1',
      feedItemId: 'feed-1',
      sourceItemId: 'source-1',
      field: 'bodyPreview',
    },
  ],
  qualityFlags: [],
  confidence: {
    level: 'medium',
    score: 0.6,
    rationale: 'Summary has direct citations to selected evidence.',
  },
  lineage: {
    promptVersion: 'prompt-v1',
    schemaVersion: 'summary.artifact.v1',
    modelVersion: 'fake-model-v1',
    providerVersion: 'fake-provider-v1',
    rulesVersion: 'rules-v1',
    evalDatasetVersion: 'eval-v1',
  },
  usage: {
    inputTokens: 10,
    outputTokens: 20,
    estimatedCostUsd: 0,
  },
  ...overrides,
});

describe('SummaryArtifact', () => {
  it('accepts a cited structured summary artifact', () => {
    expect(SummaryArtifact.create(baseArtifact()).toSnapshot()).toMatchObject({
      schemaVersion: 'summary.artifact.v1',
      summaryId: 'summary-1',
      keyPoints: [
        expect.objectContaining({
          citationIds: ['citation-1'],
        }),
      ],
    });
  });

  it('rejects key points without citations', () => {
    expect(() => SummaryArtifact.create(baseArtifact({
      keyPoints: [
        {
          claim: 'Uncited claim',
          citationIds: [],
        },
      ],
    }))).toThrow('Summary key point must have a claim and citations');
  });

  it('accepts no-signal artifact only with no-signal flag and reason', () => {
    expect(SummaryArtifact.create(baseArtifact({
      keyPoints: [],
      qualityFlags: ['no_signal'],
      confidence: {
        level: 'none',
        score: 0,
        rationale: 'No evidence was selected for this topic window.',
      },
      noSignalReason: 'No relevant items in the selected window.',
    })).toSnapshot()).toMatchObject({
      qualityFlags: ['no_signal'],
      noSignalReason: 'No relevant items in the selected window.',
    });
  });

  it('rejects confidence outside the normalized score range', () => {
    expect(() => SummaryArtifact.create(baseArtifact({
      confidence: {
        level: 'high',
        score: 1.5,
        rationale: 'Invalid score.',
      },
    }))).toThrow('Summary confidence score must be between 0 and 1');
  });
});
