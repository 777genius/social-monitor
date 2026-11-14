import type { GeneratedSummaryDraft } from '../../ports';
import {
  assertOpenAiSummaryDraftShape,
  summaryQualityFlagSet as legacyQualityFlags,
} from './openai-responses-summary-draft-shape';
import {
  assertOpenAiSummaryDraftQuality,
  summaryQualityFlagSet,
} from './openai-responses-summary-draft-quality-policy';
import { assertOpenAiSummaryDraftUsage } from './openai-responses-summary-draft-usage-policy';

// Only the fields read by draft admission are necessary for this synthetic fixture.
const validDraft = (): GeneratedSummaryDraft => ({
  headline: 'Synthetic headline',
  executiveSummary: 'Synthetic summary',
  citationMap: [{
    citationId: 'c1', feedItemId: 'feed-1', sourceItemId: 'source-1',
    providerKey: 'rss', field: 'title',
  }],
  keyPoints: [{ claim: 'Supported synthetic claim', citationIds: ['c1'] }],
  risksAndUnknowns: [],
  qualityFlags: [],
  confidence: { score: 0.7 },
  usage: { inputTokens: 2, outputTokens: 3, estimatedCostUsd: 0.01 },
} as unknown as GeneratedSummaryDraft);

describe('OpenAI summary draft independent admission policies', () => {
  it('preserves the historical quality flag object and accepts valid draft', () => {
    expect(legacyQualityFlags).toBe(summaryQualityFlagSet);
    expect(() => assertOpenAiSummaryDraftShape(validDraft())).not.toThrow();
  });

  it('checks citations before quality flags, and quality before metering', () => {
    const draft = validDraft();
    const invalid = {
      ...draft,
      keyPoints: [{ claim: 'Unsupported', citationIds: ['unknown'] }],
      qualityFlags: ['not_a_real_flag'],
      usage: { inputTokens: -1, outputTokens: 0, estimatedCostUsd: 0 },
    } as unknown as GeneratedSummaryDraft;
    expect(() => assertOpenAiSummaryDraftShape(invalid))
      .toThrow('Summary key point cites unknown citation unknown');
    expect(() => assertOpenAiSummaryDraftShape({
      ...invalid, keyPoints: draft.keyPoints,
    })).toThrow('Invalid summary quality flag not_a_real_flag');
    expect(() => assertOpenAiSummaryDraftShape({
      ...invalid, keyPoints: draft.keyPoints, qualityFlags: [],
    })).toThrow('Summary usage values must be non-negative');
  });

  it('keeps the no-signal claim and reason invariants independent of accounting', () => {
    const draft = validDraft();
    expect(() => assertOpenAiSummaryDraftQuality({
      ...draft, keyPoints: [], qualityFlags: [],
    })).toThrow('No-signal summary must include no_signal quality flag');
    expect(() => assertOpenAiSummaryDraftQuality({
      ...draft, keyPoints: [], qualityFlags: ['no_signal'], noSignalReason: '  ',
    })).toThrow('No-signal summary must include a reason');
    expect(() => assertOpenAiSummaryDraftQuality({
      ...draft, keyPoints: [], qualityFlags: ['no_signal'], noSignalReason: 'No input evidence',
    })).not.toThrow();
  });

  it('preserves confidence range and negative usage rejection', () => {
    const draft = validDraft();
    expect(() => assertOpenAiSummaryDraftQuality({
      ...draft, confidence: { ...draft.confidence, score: 1.1 },
    })).toThrow('Summary confidence score must be between 0 and 1');
    expect(() => assertOpenAiSummaryDraftUsage({
      usage: { inputTokens: 0, outputTokens: -1, estimatedCostUsd: 0 },
    })).toThrow('Summary usage values must be non-negative');
    expect(() => assertOpenAiSummaryDraftUsage({
      usage: { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 },
    })).not.toThrow();
  });

  it('rejects invalid headline before any quality or citation checks', () => {
    const draft = validDraft();
    expect(() => assertOpenAiSummaryDraftShape({
      ...draft, headline: ' ', qualityFlags: ['invalid'] as never,
      keyPoints: [{ claim: 'Unsupported', citationIds: ['missing'] }],
    })).toThrow('Summary headline must be non-empty');
  });
});
