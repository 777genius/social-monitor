import { err, ok, type Result } from '@social-monitor/shared-kernel';

export const READER_VALUE_SCHEMA_VERSION = 'reader_value.v1';

export const readerValueLabels = {
  usefulness: ['noise', 'context', 'useful', 'important', 'insufficient_context'],
  relevance: ['unrelated', 'adjacent', 'relevant', 'central', 'insufficient_context'],
  context_sufficiency: ['insufficient', 'partial', 'sufficient'],
  evidence_basis: ['observation', 'described_data', 'linked_claim', 'unsupported_claim', 'no_claim', 'insufficient_context'],
} as const;

export type ReaderValueCriterion = keyof typeof readerValueLabels;
export type ReaderValueChoice<K extends ReaderValueCriterion> = typeof readerValueLabels[K][number];
export type ReaderValueAnswer<K extends ReaderValueCriterion> = {
  readonly choice: ReaderValueChoice<K>;
  readonly probabilities: Readonly<Record<ReaderValueChoice<K>, number>>;
  readonly confidence: number;
  readonly choiceDiffersFromArgmax: boolean;
  readonly probabilityTie: boolean;
};
export type ReaderValueAnswers = {
  readonly [K in ReaderValueCriterion]: ReaderValueAnswer<K>;
};

export type ReaderValueValidationFailure = 'invalid_questions' | 'invalid_answer';

/** Validates the whole assessment. Provider choice is authoritative, including ties. */
export function validateReaderValueAnswers(
  input: unknown,
): Result<ReaderValueAnswers, ReaderValueValidationFailure> {
  if (!isRecord(input) || !sameKeys(input, Object.keys(readerValueLabels))) {
    return err('invalid_questions');
  }
  const validated: Partial<Record<ReaderValueCriterion, ReaderValueAnswer<ReaderValueCriterion>>> = {};
  for (const criterion of Object.keys(readerValueLabels) as ReaderValueCriterion[]) {
    const answer = validateReaderValueAnswer(criterion, input[criterion]);
    if (!answer.ok) return answer;
    validated[criterion] = answer.value;
  }
  return ok(Object.freeze(validated) as ReaderValueAnswers);
}

/** A refusal in another criterion must not hide an invalid choice answer. */
export function validateReaderValueAnswer<K extends ReaderValueCriterion>(
  criterion: K, input: unknown,
): Result<ReaderValueAnswer<K>, 'invalid_answer'> {
  const labels: readonly string[] = readerValueLabels[criterion];
  if (!isRecord(input) || typeof input.choice !== 'string' || !labels.includes(input.choice)
    || !isProbability(input.confidence) || !isRecord(input.probabilities)
    || !sameKeys(input.probabilities, labels)) return err('invalid_answer');
  const probabilities = input.probabilities;
  const values = labels.map((label) => probabilities[label]);
  if (!values.every(isProbability) || Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) > 0.02) {
    return err('invalid_answer');
  }
  const maximum = Math.max(...values);
  const choiceDiffersFromArgmax = probabilities[input.choice] !== maximum;
  const probabilityTie = values.filter((value) => value === maximum).length > 1;
  if ((Object.hasOwn(input, 'choiceDiffersFromArgmax') && input.choiceDiffersFromArgmax !== choiceDiffersFromArgmax)
    || (Object.hasOwn(input, 'probabilityTie') && input.probabilityTie !== probabilityTie)) return err('invalid_answer');
  return ok(Object.freeze({ choice: input.choice as ReaderValueChoice<K>,
    probabilities: Object.freeze({ ...probabilities }) as ReaderValueAnswer<K>['probabilities'],
    confidence: input.confidence, choiceDiffersFromArgmax, probabilityTie }));
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const sameKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));

const isProbability = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
