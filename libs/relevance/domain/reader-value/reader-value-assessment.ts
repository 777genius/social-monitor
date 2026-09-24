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
    const answer = input[criterion];
    const labels: readonly string[] = readerValueLabels[criterion];
    if (!isRecord(answer) || typeof answer.choice !== 'string' || !labels.includes(answer.choice)
      || !isProbability(answer.confidence) || !isRecord(answer.probabilities)
      || !sameKeys(answer.probabilities, labels)) {
      return err('invalid_answer');
    }
    const probabilities = answer.probabilities;
    const values = labels.map((label) => probabilities[label]);
    if (!values.every(isProbability) || Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) > 0.02) {
      return err('invalid_answer');
    }
    const maximum = Math.max(...values);
    const choiceDiffersFromArgmax = probabilities[answer.choice] !== maximum;
    const probabilityTie = values.filter((value) => value === maximum).length > 1;
    if ((Object.hasOwn(answer, 'choiceDiffersFromArgmax') &&
        answer.choiceDiffersFromArgmax !== choiceDiffersFromArgmax) ||
        (Object.hasOwn(answer, 'probabilityTie') &&
        answer.probabilityTie !== probabilityTie)) {
      return err('invalid_answer');
    }
    validated[criterion] = {
      choice: answer.choice as ReaderValueChoice<ReaderValueCriterion>,
      probabilities: Object.freeze({ ...probabilities }) as ReaderValueAnswer<ReaderValueCriterion>['probabilities'],
      confidence: answer.confidence,
      choiceDiffersFromArgmax,
      probabilityTie,
    };
    Object.freeze(validated[criterion]);
  }
  return ok(Object.freeze(validated) as ReaderValueAnswers);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const sameKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));

const isProbability = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
