import { isConciseDisplayText } from './reader-post-display-headline';
import type { ReaderPostPresentationCandidate, ReaderPostPresentationProposalFailure } from './reader-post-presentation-v3-proposal';
import { readerPostPresentationCatalogOutputSchema, readerPostPresentationCatalogProposalFailure } from './reader-post-presentation-reference-catalog';

export const MIMO_QUALIFIED_HEADLINE_CONTRACT = 'mimo_qualified_headline.v1' as const;

/** Model-facing composition contract; canonical public presentation wire stays unchanged. */
export const mimoQualifiedHeadlineOutputSchema = (candidates: readonly ReaderPostPresentationCandidate[]) => {
  const canonical = readerPostPresentationCatalogOutputSchema(candidates);
  return { ...canonical, required: ['contractVersion', 'presentations'], properties: {
    contractVersion: { type: 'string', const: MIMO_QUALIFIED_HEADLINE_CONTRACT },
    presentations: { ...canonical.properties.presentations, items: { oneOf:
      canonical.properties.presentations.items.oneOf.map(branch => {
        const properties = { candidateId: branch.properties.candidateId, status: branch.properties.status,
          kind: branch.properties.kind, support: branch.properties.support,
          qualifications: branch.properties.qualifications, confidence: branch.properties.confidence };
        return { ...branch, required: branch.required.filter(key => key !== 'text' && key !== 'qualificationJudgment')
          .concat('baseHeadline'), properties: { ...properties, baseHeadline: branch.properties.text } };
      }) } },
  } };
};

type Decoded = { readonly output: { readonly presentations: readonly Record<string, unknown>[] };
  readonly failure: null } | { readonly output: null; readonly failure: ReaderPostPresentationProposalFailure };

/** Decode only this declared wire. Never repair an old canonical proposal or omit qualifications. */
export const decodeMimoQualifiedHeadlines = (
  wire: unknown, candidates: readonly ReaderPostPresentationCandidate[],
): Decoded => {
  const reject = (code: ReaderPostPresentationProposalFailure['code'], index?: number): Decoded =>
    ({ output: null, failure: { code, ...(index === undefined ? {} : { index }) } });
  if (!exact(wire, ['contractVersion', 'presentations']) || wire.contractVersion !== MIMO_QUALIFIED_HEADLINE_CONTRACT
    || !Array.isArray(wire.presentations)) return reject('proposal_fields');
  const presentations: Record<string, unknown>[] = [];
  for (const [index, item] of wire.presentations.entries()) {
    if (!exact(item, ['candidateId', 'status', 'kind', 'baseHeadline', 'support', 'qualifications', 'confidence'])
      || typeof item.baseHeadline !== 'string' || !Array.isArray(item.qualifications)
      || !item.qualifications.every(q => exact(q, ['phrase', 'evidence']) && typeof q.phrase === 'string')) {
      return reject('proposal_fields', index);
    }
    if (item.status === 'available' && !isConciseDisplayText(item.baseHeadline)) return reject('display_text', index);
    const { baseHeadline, ...fields } = item;
    const phrases = item.qualifications.map(q => q.phrase as string);
    const text = phrases.length ? `${baseHeadline} (${phrases.join('; ')})` : baseHeadline;
    presentations.push({ ...fields, text, qualificationJudgment: item.kind === 'subject_label'
      ? 'subject_only' : phrases.length ? 'preserved' : 'none' });
  }
  const output = { presentations };
  const failure = readerPostPresentationCatalogProposalFailure(output, candidates);
  return failure === null ? { output, failure: null } : { output: null, failure };
};

const exact = (value: unknown, keys: readonly string[]): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
  && Reflect.ownKeys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
