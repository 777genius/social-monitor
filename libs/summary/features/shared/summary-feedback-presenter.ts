import type { SummaryFeedback, SummaryFeedbackEvidence } from '../../domain';

export type SummaryFeedbackView = {
  readonly feedbackId: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly summaryId: string;
  readonly interestId: string;
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
    interestId: snapshot.interestId,
    submittedBy: snapshot.submittedBy,
    rating: snapshot.rating,
    category: snapshot.category,
    comment: snapshot.comment,
    evidence: {
      summaryId: snapshot.evidence.summaryId,
      interestId: snapshot.evidence.interestId,
      citationId: snapshot.evidence.citationId,
      feedItemId: snapshot.evidence.feedItemId,
      sourceItemId: snapshot.evidence.sourceItemId,
      providerKey: snapshot.evidence.providerKey,
    },
    triageOwner: snapshot.triageOwner,
    eligibleForEvalFixture: snapshot.eligibleForEvalFixture,
    createdAt: snapshot.createdAt.toISOString(),
  };
};
