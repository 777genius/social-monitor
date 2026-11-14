// Stable public entrypoint: keep untrusted provider JSON decoding independent
// from evidence rebinding and claim/risk reference admission.
export { normalizeCitationMap, normalizeCitationIds } from './openai-responses-summary-provider-citation-decoder';

// Retain the existing citation API while separating evidence trust from draft references.
export {
  fallbackCitationMap,
  withEvidenceBackedCitations,
  chooseEvidenceCitationField,
} from './openai-responses-summary-evidence-citations';
export {
  withKnownCitationIds,
  withKnownRiskCitationIds,
} from './openai-responses-summary-citation-references';

