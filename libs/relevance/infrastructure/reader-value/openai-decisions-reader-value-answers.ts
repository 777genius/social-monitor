import { readerValueLabels, validateReaderValueAnswer, validateReaderValueAnswers,
  type ReaderValueAnswers, type ReaderValueCriterion } from '../../domain/reader-value/reader-value-assessment';

export const readerValueRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Validate every sibling before interpreting any refusal as a terminal item. */
export function parseOpenAiDecisionsReaderValueAnswers(value: unknown):
  | { readonly ok: true; readonly answers: ReaderValueAnswers }
  | { readonly ok: false; readonly code: 'schema_invalid' | 'provider_refused' } {
  const invalid = { ok: false, code: 'schema_invalid' } as const;
  if (!Array.isArray(value) || value.length !== Object.keys(readerValueLabels).length) return invalid;
  const seen = new Set<string>();
  const mapped: Record<string, unknown> = {};
  let refused = false;
  for (const entry of value) {
    if (!readerValueRecord(entry) || typeof entry.name !== 'string'
      || !Object.hasOwn(readerValueLabels, entry.name) || seen.has(entry.name)) return invalid;
    seen.add(entry.name);
    if (entry.type === 'refusal') { refused = true; continue; }
    if (entry.type !== 'choice' || !Array.isArray(entry.probabilities)) return invalid;
    const probabilities: Record<string, unknown> = {};
    const labels: readonly string[] = readerValueLabels[entry.name as ReaderValueCriterion];
    for (const probability of entry.probabilities) {
      if (!readerValueRecord(probability) || typeof probability.value !== 'string'
        || Object.hasOwn(probabilities, probability.value)
        || !labels.includes(probability.value)) return invalid;
      probabilities[probability.value] = probability.probability;
    }
    const answer = validateReaderValueAnswer(entry.name as ReaderValueCriterion,
      { choice: entry.choice, confidence: entry.confidence, probabilities });
    if (!answer.ok) return invalid;
    mapped[entry.name] = answer.value;
  }
  if (refused) return { ok: false, code: 'provider_refused' };
  const answers = validateReaderValueAnswers(mapped);
  return answers.ok ? { ok: true, answers: answers.value } : invalid;
}
