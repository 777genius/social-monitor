import type { SummaryHeadlineReference } from "../value-objects/summary-reader-headline";
import { readerPostPresentationProposalFailure, readerPostPresentationV3OutputSchema,
  type ReaderPostPresentationCandidate, type ReaderPostPresentationProposalFailure } from "./reader-post-presentation-v3-proposal";

type Reference = SummaryHeadlineReference;
const key = (reference: Reference): string => JSON.stringify([reference.field, reference.start, reference.end, reference.quote]);

/** Copy affordances only: the complete source and semantic acceptance remain authoritative. */
export const readerPostPresentationReferenceCatalog = (candidate: ReaderPostPresentationCandidate): readonly Reference[] => {
  const result: Reference[] = [];
  const add = (field: Reference["field"], text: string, start: number, end: number): void => {
    if (start > 0 && /[\uDC00-\uDFFF]/u.test(text[start]!) && /[\uD800-\uDBFF]/u.test(text[start - 1]!)) start++;
    end = Math.min(end, start + 64);
    if (end < text.length && /[\uD800-\uDBFF]/u.test(text[end - 1]!)) end--;
    while (end > start && JSON.stringify(text.slice(start, end)).length > 128) {
      end--;
      if (end > start && /[\uD800-\uDBFF]/u.test(text[end - 1]!)) end--;
    }
    const quote = text.slice(start, end);
    const reference = { field, start, end, quote };
    if (quote.trim() && !result.some(existing => key(existing) === key(reference))) result.push(Object.freeze(reference));
  };
  for (const [field, text, limit] of [["title", candidate.title, 8], ["bodyPreview", candidate.sourceText, 32]] as const) {
    const count = Math.min(limit, Math.ceil(text.length / 64));
    for (let index = 0; index < count; index++) {
      const start = text.length <= limit * 64 ? index * 64 : Math.floor(index * (text.length - 64) / (count - 1));
      add(field, text, start, Math.min(start + 64, text.length));
    }
    // Whole tokens keep the existing subject-label contract expressible without offset arithmetic.
    let tokens = 0;
    for (const match of text.matchAll(/[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N}._+-]{0,39}/gu)) {
      if (tokens++ === 8) break;
      add(field, text, match.index, match.index + match[0].length);
    }
  }
  return Object.freeze(result);
};

/** A source-derived subset of the public wire shape; it never widens the shared product predicate. */
export const readerPostPresentationCatalogOutputSchema = (candidates: readonly ReaderPostPresentationCandidate[]) => {
  const base = readerPostPresentationV3OutputSchema.properties.presentations.items;
  const branches = candidates.map(candidate => {
    const references = readerPostPresentationReferenceCatalog(candidate);
    const reference = { ...base.properties.support.items, ...(references.length ? { enum: references } : {}) };
    return { ...base, properties: { ...base.properties,
      candidateId: { ...base.properties.candidateId, const: candidate.candidateId },
      support: { ...base.properties.support, maxItems: references.length ? 4 : 0, uniqueItems: true, items: reference },
      qualifications: { ...base.properties.qualifications, maxItems: references.length ? 2 : 0,
        items: { ...base.properties.qualifications.items, properties: { ...base.properties.qualifications.items.properties,
          evidence: { ...base.properties.qualifications.items.properties.evidence, maxItems: 2,
            uniqueItems: true, items: reference } } } },
    } };
  });
  return { ...readerPostPresentationV3OutputSchema, properties: { presentations: {
    ...readerPostPresentationV3OutputSchema.properties.presentations,
    minItems: candidates.length, maxItems: candidates.length, items: { oneOf: branches },
  } } };
};

/** Recheck the catalog independently of SDK schema normalization, then retain every semantic guard. */
export const readerPostPresentationCatalogProposalFailure = (
  output: unknown, candidates: readonly ReaderPostPresentationCandidate[],
): ReaderPostPresentationProposalFailure | null => {
  const failure = readerPostPresentationProposalFailure(output, candidates);
  if (failure !== null) return failure;
  const proposals = (output as { presentations: readonly { candidateId: string; support: readonly Reference[];
    qualifications: readonly { evidence: readonly Reference[] }[] }[] }).presentations;
  const byId = new Map(candidates.map(candidate => [candidate.candidateId,
    new Set(readerPostPresentationReferenceCatalog(candidate).map(key))]));
  for (const [index, proposal] of proposals.entries()) {
    if (proposal.support.length > 4 || proposal.qualifications.length > 2 ||
        proposal.qualifications.some(qualification => qualification.evidence.length > 2)) return { code: "quote_budget", index };
    const references = [...proposal.support, ...proposal.qualifications.flatMap(qualification => qualification.evidence)];
    if (references.some(reference => !byId.get(proposal.candidateId)!.has(key(reference)))) return { code: "source_reference", index };
  }
  return null;
};
