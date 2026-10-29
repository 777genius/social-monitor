import { readerValueQuestions } from '../../domain/reader-value/reader-value-rubric';
import { readerValueScoringConfiguration, type ReaderValueScoringProvider } from './reader-value-provider-config';

export type ReaderValueRequestState = {
  readonly trusted_interest: string; readonly title: string;
  readonly source_text: string; readonly context_state: string;
};

const decisionsQuestions = Object.entries(readerValueQuestions).map(([name, question]) => ({
  name, type: question.type, instructions: question.instructions,
  choices: Object.entries(question.criteria).map(([value, description]) => ({ value, description })),
}));

export function serializeReaderValueRequest(provider: ReaderValueScoringProvider, state: ReaderValueRequestState): string {
  const model = readerValueScoringConfiguration(provider).requestedModel;
  return JSON.stringify(provider === 'openrouter-systemone'
    ? { model, state, questions: readerValueQuestions }
    : { model, input: [{ role: 'user', content: [{ type: 'input_json', data: state }] }], questions: decisionsQuestions });
}

export function readerValueLargestQuestionBytes(provider: ReaderValueScoringProvider): number {
  const questions = provider === 'openrouter-systemone' ? Object.values(readerValueQuestions) : decisionsQuestions;
  return Math.max(...questions.map((question) => Buffer.byteLength(JSON.stringify(question))));
}
