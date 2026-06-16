import type { SummaryFeedback, SummaryFeedbackEvidence } from '../../domain';

export type SummaryFeedbackView = {
  readonly feedbackId: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly summaryId: string;
  readonly topicId: string;
  readonly submittedBy: string;
  readonly rating: number;
  readonly category: string;
  readonly comment?: string;
  readonly evidence: SummaryFeedbackEvidence;
  readonly triageOwner: string;
  readonly eligibleForEvalFixture: boolean;
  readonly createdAt: string;
};

export const presentSummaryFeedback = (feedback: SummaryFeedback): SummaryFeedbackView => {
  const snapshot = feedback.toSnapshot();

  return {
    feedbackId: snapshot.id,
    tenantId: snapshot.tenantId,
    workspaceId: snapshot.workspaceId,
    summaryId: snapshot.summaryId,
    topicId: snapshot.topicId,
    submittedBy: snapshot.submittedBy,
    rating: snapshot.rating,
    category: snapshot.category,
    comment: snapshot.comment,
    evidence: {
      summaryId: snapshot.evidence.summaryId,
      topicId: snapshot.evidence.topicId,
      citationId: snapshot.evidence.citationId,
      feedItemId: snapshot.evidence.feedItemId,
      sourceItemId: snapshot.evidence.sourceItemId,
    },
    triageOwner: snapshot.triageOwner,
    eligibleForEvalFixture: snapshot.eligibleForEvalFixture,
    createdAt: snapshot.createdAt.toISOString(),
  };
};
