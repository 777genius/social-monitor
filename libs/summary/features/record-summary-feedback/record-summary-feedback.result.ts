import type { SummaryFeedbackCategory, SummaryFeedbackEvidence, SummaryFeedbackTriageOwner } from '../../domain';

export type RecordSummaryFeedbackResult = {
  readonly feedbackId: string;
  readonly created: boolean;
  readonly category: SummaryFeedbackCategory;
  readonly triageOwner: SummaryFeedbackTriageOwner;
  readonly evidence: SummaryFeedbackEvidence;
  readonly eligibleForEvalFixture: boolean;
  readonly createdAt: string;
};
