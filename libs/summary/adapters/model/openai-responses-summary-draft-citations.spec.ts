import type { GeneratedSummaryDraft } from '../../ports';
import { assertOpenAiSummaryDraftCitations } from './openai-responses-summary-draft-citations';

type CitationDraft = Pick<GeneratedSummaryDraft, 'citationMap' | 'keyPoints' | 'risksAndUnknowns'>;

const validDraft = (): CitationDraft => ({
  citationMap: [{
    citationId: 'c1',
    feedItemId: 'synthetic-feed',
    sourceItemId: 'synthetic-source',
    providerKey: 'reddit',
    field: 'title',
  }],
  keyPoints: [{ claim: 'Synthetic supported claim', citationIds: ['c1'] }],
  risksAndUnknowns: [{ description: 'Synthetic known risk', citationIds: ['c1'] }],
});

describe('OpenAI summary draft citation trust boundary', () => {
  it('accepts known references, including risks with absent citations', () => {
    const valid = validDraft();
    expect(() => assertOpenAiSummaryDraftCitations(valid)).not.toThrow();
    expect(() => assertOpenAiSummaryDraftCitations({
      ...valid, risksAndUnknowns: [{ description: 'Synthetic uncertainty' }],
    })).not.toThrow();
  });

  it('rejects empty and duplicate identifiers before checking their references', () => {
    const valid = validDraft();
    expect(() => assertOpenAiSummaryDraftCitations({
      ...valid, citationMap: [{ ...valid.citationMap[0]!, citationId: ' ' }],
      keyPoints: [{ claim: 'Claim', citationIds: ['unknown'] }],
    })).toThrow('Summary citation id must be non-empty');
    expect(() => assertOpenAiSummaryDraftCitations({
      ...valid, citationMap: [...valid.citationMap, valid.citationMap[0]!],
      keyPoints: [{ claim: 'Claim', citationIds: ['unknown'] }],
    })).toThrow('Duplicate summary citation id c1');
  });

  it('rejects unsupported or empty key point claims and references', () => {
    const valid = validDraft();
    expect(() => assertOpenAiSummaryDraftCitations({
      ...valid, keyPoints: [{ claim: ' ', citationIds: ['c1'] }],
    })).toThrow('Summary key point must include a claim and citations');
    expect(() => assertOpenAiSummaryDraftCitations({
      ...valid, keyPoints: [{ claim: 'Claim', citationIds: [] }],
    })).toThrow('Summary key point must include a claim and citations');
    expect(() => assertOpenAiSummaryDraftCitations({
      ...valid, keyPoints: [{ claim: 'Claim', citationIds: ['unknown'] }],
    })).toThrow('Summary key point cites unknown citation unknown');
  });

  it('checks risks after key points, preserving fail-closed diagnostic order', () => {
    const valid = validDraft();
    expect(() => assertOpenAiSummaryDraftCitations({
      ...valid,
      keyPoints: [{ claim: 'Claim', citationIds: ['unknown'] }],
      risksAndUnknowns: [{ description: ' ', citationIds: ['unknown'] }],
    })).toThrow('Summary key point cites unknown citation unknown');
    expect(() => assertOpenAiSummaryDraftCitations({
      ...valid, risksAndUnknowns: [{ description: ' ' }],
    })).toThrow('Summary risk description must be non-empty');
    expect(() => assertOpenAiSummaryDraftCitations({
      ...valid, risksAndUnknowns: [{ description: 'Risk', citationIds: ['unknown'] }],
    })).toThrow('Summary risk cites unknown citation unknown');
  });
});
