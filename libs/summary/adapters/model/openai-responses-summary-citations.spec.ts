import type { SummaryCitation, SummaryKeyPoint, SummaryRisk } from '../../domain';
import type { SummaryModelInput } from '../../ports';
import { normalizeCitationMap } from './openai-responses-summary-citations';
import {
  fallbackCitationMap,
  withEvidenceBackedCitations,
} from './openai-responses-summary-evidence-citations';
import {
  withKnownCitationIds,
  withKnownRiskCitationIds,
} from './openai-responses-summary-citation-references';

const evidence = [
  {
    feedItemId: 'feed-1',
    sourceItemId: 'source-1',
    providerKey: 'reddit',
    bodyPreview: 'Synthetic source body',
    canonicalUrl: 'https://example.test/source-one',
  },
  {
    feedItemId: 'feed-2',
    sourceItemId: 'source-2',
    providerKey: 'github',
    bodyPreview: undefined,
    canonicalUrl: undefined,
  },
] as unknown as SummaryModelInput['evidence']['items'];

const modelCitation = (
  citationId: string,
  field: SummaryCitation['field'] = 'bodyPreview',
): SummaryCitation => ({
  citationId,
  feedItemId: 'spoofed-feed',
  sourceItemId: 'spoofed-source',
  providerKey: 'spoofed-provider',
  field,
});

describe('OpenAI summary citation trust and reference boundaries', () => {
  it('rejects malformed model citation fields rather than interpreting them as evidence', () => {
    expect(normalizeCitationMap({ c1: 'feed-1' })).toEqual([]);
    expect(() => normalizeCitationMap([{
      ...modelCitation('c1'), field: 'untrusted-field',
    }])).toThrow('Invalid citation field');
    expect(() => normalizeCitationMap([{
      ...modelCitation('c1'), feedItemId: null,
    }])).toThrow();
  });

  it('derives fallback citations only from selected evidence, preserving field order', () => {
    expect(fallbackCitationMap(evidence)).toEqual([
      { citationId: 'c1', feedItemId: 'feed-1', sourceItemId: 'source-1', providerKey: 'reddit', field: 'bodyPreview' },
      { citationId: 'c2', feedItemId: 'feed-2', sourceItemId: 'source-2', providerKey: 'github', field: 'title' },
    ]);
  });

  it('rebinds model citations to the selected evidence, dropping invented ids and unsupported fields', () => {
    expect(withEvidenceBackedCitations([
      modelCitation('c1', 'canonicalUrl'),
      modelCitation('c2'),
      modelCitation('c99'),
    ], evidence)).toEqual([
      {
        citationId: 'c1', feedItemId: 'feed-1', sourceItemId: 'source-1',
        providerKey: 'reddit', canonicalUrl: 'https://example.test/source-one', field: 'canonicalUrl',
      },
      {
        citationId: 'c2', feedItemId: 'feed-2', sourceItemId: 'source-2',
        providerKey: 'github', canonicalUrl: undefined, field: 'title',
      },
    ]);
  });

  it('deduplicates keypoint ids and clears unknown risk citations without dropping the risk', () => {
    const known = new Set(['c1', 'c2']);
    const keyPoints = [
      { claim: 'Synthetic verified claim', citationIds: ['c2', 'unknown', 'c1', 'c2'] },
      { claim: 'Unverified model claim', citationIds: ['unknown'] },
    ] as SummaryKeyPoint[];
    const risks = [
      { description: 'Unverified synthetic concern', citationIds: ['unknown'] },
      { description: 'Known synthetic concern', citationIds: ['c2', 'c2', 'unknown'] },
    ] as SummaryRisk[];
    expect(withKnownCitationIds(keyPoints, known)).toEqual([
      { claim: 'Synthetic verified claim', citationIds: ['c2', 'c1'] },
    ]);
    expect(withKnownRiskCitationIds(risks, known)).toEqual([
      { description: 'Unverified synthetic concern', citationIds: undefined },
      { description: 'Known synthetic concern', citationIds: ['c2'] },
    ]);
  });
});
