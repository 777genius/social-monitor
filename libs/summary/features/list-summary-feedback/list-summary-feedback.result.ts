import type { SummaryFeedbackView } from '../shared/summary-feedback-presenter';

export type ListSummaryFeedbackResult = {
  readonly items: readonly SummaryFeedbackView[];
  readonly nextCursor?: string;
};
