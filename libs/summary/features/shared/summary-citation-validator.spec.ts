import type { GeneratedSummaryDraft, SummaryEvidenceSelection } from '../../ports';
import { validateSummaryCitationsAgainstEvidence } from './summary-citation-validator';

const evidence: SummaryEvidenceSelection = {
  sourceWindow: {
    windowId: 'window-1',
    startedAt: new Date('2026-06-06T00:00:00.000Z'),
    endedAt: new Date('2026-06-06T00:00:01.000Z'),
    selectedFeedItemIds: ['feed-1'],
  },
  items: [
    {
      feedItemId: 'feed-1',
      sourceItemId: 'source-1',
      sourceBindingId: 'binding-1',
      providerKey: 'rss',
      title: 'Selected source',
      bodyPreview: 'Selected body',
      canonicalUrl: 'https://example.test/source-1',
      observedAt: new Date('2026-06-06T00:00:00.000Z'),
    },
  ],
};

const draft = (overrides: Partial<GeneratedSummaryDraft> = {}): GeneratedSummaryDraft => ({
  headline: 'Selected source',
  executiveSummary: 'Summary uses selected evidence.',
  keyPoints: [{ claim: 'Selected source', citationIds: ['c1'] }],
  risksAndUnknowns: [{ description: 'Limited source depth.', citationIds: ['c1'], reason: 'source_limit' }],
  sourceHighlights: ['Selected source'],
  citationMap: [
    {
      citationId: 'c1',
      feedItemId: 'feed-1',
      sourceItemId: 'source-1',
      field: 'title',
    },
  ],
  qualityFlags: ['limited_sources'],
  confidence: {
    level: 'low',
    score: 0.35,
    rationale: 'Only one source was selected.',
  },
  lineage: {
    promptVersion: 'summary.prompt.test.v1',
    schemaVersion: 'summary.artifact.v1',
    modelVersion: 'summary-model-test',
    providerVersion: 'summary-provider-test',
    rulesVersion: 'summary.rules.test.v1',
    evalDatasetVersion: 'summary.eval.test.v1',
  },
  usage: {
    inputTokens: 10,
    outputTokens: 20,
    estimatedCostUsd: 0,
  },
  ...overrides,
});

describe('validateSummaryCitationsAgainstEvidence', () => {
  it('accepts citations that point to selected evidence', () => {
    expect(() => validateSummaryCitationsAgainstEvidence(draft(), evidence)).not.toThrow();
  });

  it('rejects citations that point outside the selected source window', () => {
    expect(() => validateSummaryCitationsAgainstEvidence(draft({
      citationMap: [
        {
          citationId: 'c1',
          feedItemId: 'feed-outside-window',
          sourceItemId: 'source-1',
          field: 'title',
        },
      ],
    }), evidence)).toThrow('Summary citation validation failed: citation c1 references unselected feed item');
  });

  it('rejects citations that mismatch selected source items', () => {
    expect(() => validateSummaryCitationsAgainstEvidence(draft({
      citationMap: [
        {
          citationId: 'c1',
          feedItemId: 'feed-1',
          sourceItemId: 'source-other',
          field: 'title',
        },
      ],
    }), evidence)).toThrow('Summary citation validation failed: citation c1 source item mismatch');
  });
});
