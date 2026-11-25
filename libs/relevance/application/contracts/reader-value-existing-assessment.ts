import type { ReaderValueAssessment, ReaderValuePreparedInput } from './reader-value-assessment-store';

/** Exact current input lookup without creating assessments, pins, or model work. */
export interface ReaderValueExistingAssessment {
  find(input: ReaderValuePreparedInput): Promise<ReaderValueAssessment | null>;
}
