import type { SummaryFeedbackCategory } from '../../domain';

export type RedactedSummaryFeedbackSampleInput = {
  readonly feedbackId: string;
  readonly category: SummaryFeedbackCategory;
  readonly classification: 'blocker' | 'accepted_mvp_gap' | 'evidence_based_opportunity' | 'deferred_idea';
  readonly severity: 'blocker' | 'accepted_gap' | 'opportunity' | 'watch';
  readonly triageOwner: string;
  readonly eligibleForEvalFixture: boolean;
  readonly releaseBlocking: true;
  readonly summaryEvidence: {
    readonly summaryId: string;
    readonly topicId: string;
    readonly citationId?: string;
    readonly feedItemId?: string;
    readonly sourceItemId?: string;
  };
  readonly sanitizedSignal: string;
  readonly redactedComment: string;
  readonly qualitySignals: {
    readonly claimsChecked: true;
    readonly citationsChecked: true;
    readonly costChecked: true;
    readonly staleMarkerChecked: true;
  };
  readonly hardeningAction: {
    readonly actionType: 'eval_fixture' | 'validator_change' | 'runbook_action';
    readonly status: 'passed';
    readonly command: string;
    readonly artifact: string;
    readonly fixtureIds: readonly string[];
    readonly exitCondition: string;
  };
};

export type ExportSummaryFeedbackSamplesResult = {
  readonly samples: readonly RedactedSummaryFeedbackSampleInput[];
  readonly sampleWindow: {
    readonly startedAt: string;
    readonly endedAt: string;
  };
  readonly source: {
    readonly kind: string;
    readonly environmentId: string;
    readonly sampleWindow: {
      readonly startedAt: string;
      readonly endedAt: string;
    };
    readonly operator: string;
    readonly sampleCount: number;
    readonly collectionMethod: string;
    readonly redactedBy: string;
    readonly approvedBy: string;
    readonly export: {
      readonly sourceSystem: string;
      readonly exportId: string;
      readonly exportedAt: string;
      readonly reviewQueue: string;
      readonly redactionReviewId: string;
      readonly approvalReference: string;
    };
  };
};
