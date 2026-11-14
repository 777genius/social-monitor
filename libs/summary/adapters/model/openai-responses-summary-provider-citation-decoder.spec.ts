import type { SummaryCitation } from '../../domain';
import {
  normalizeCitationIds,
  normalizeCitationMap,
} from './openai-responses-summary-provider-citation-decoder';
import {
  normalizeCitationIds as legacyNormalizeCitationIds,
  normalizeCitationMap as legacyNormalizeCitationMap,
} from './openai-responses-summary-citations';

const citation = {
  citationId: 'c1',
  feedItemId: 'untrusted-feed',
  sourceItemId: 'untrusted-source',
  providerKey: 'untrusted-provider',
  field: 'bodyPreview',
};

describe('OpenAI provider citation decoding boundary', () => {
  it('preserves the historical entrypoint and its exact function identities', () => {
    expect(legacyNormalizeCitationMap).toBe(normalizeCitationMap);
    expect(legacyNormalizeCitationIds).toBe(normalizeCitationIds);
  });

  it('preserves array order, raw identity and citation field parsing before evidence rebinding', () => {
    expect(normalizeCitationMap([citation, { ...citation, citationId: 'c2', field: 'title' }]))
      .toEqual([citation, { ...citation, citationId: 'c2', field: 'title' }]);
    expect(normalizeCitationMap([citation, citation]).length).toBe(2);
    expect(normalizeCitationMap(undefined)).toEqual([]);
    expect(normalizeCitationMap({ citationId: 'c1' })).toEqual([]);
    expect(normalizeCitationMap([])).toEqual([]);
  });

  it('fails closed on unknown field and malformed object/string values with unchanged diagnostics', () => {
    expect(() => normalizeCitationMap([{ ...citation, field: 'invented' }]))
      .toThrow('Invalid citation field at citationMap[0].field');
    expect(() => normalizeCitationMap([null])).toThrow();
    expect(() => normalizeCitationMap([{ ...citation, feedItemId: 123 }])).toThrow();
    expect(() => normalizeCitationMap([{ ...citation, field: null }])).toThrow();
  });

  it('keeps optional raw reference semantics without silently accepting malformed arrays', () => {
    expect(normalizeCitationIds(undefined, 'references')).toEqual([]);
    expect(normalizeCitationIds(null, 'references')).toEqual([]);
    expect(normalizeCitationIds(['c2', 'c1'], 'references')).toEqual(['c2', 'c1']);
    expect(() => normalizeCitationIds('c1', 'references')).toThrow();
    expect(() => normalizeCitationIds([null], 'references')).toThrow();
  });
});
