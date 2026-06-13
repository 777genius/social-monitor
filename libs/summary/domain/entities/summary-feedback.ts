import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export const summaryFeedbackCategories = [
  'wrong_fact',
  'missing_source',
  'bad_citation',
  'low_relevance',
  'too_verbose',
  'too_terse',
  'source_request',
  'ux_confusing',
  'other',
] as const;

export type SummaryFeedbackCategory = (typeof summaryFeedbackCategories)[number];

export type SummaryFeedbackTriageOwner =
  | 'product-owner'
  | 'source-owner'
  | 'summary-owner'
  | 'support-owner';

export type SummaryFeedbackEvidence = {
  readonly summaryId: string;
  readonly topicId: string;
  readonly citationId?: string;
  readonly feedItemId?: string;
  readonly sourceItemId?: string;
};

export type SummaryFeedbackProps = {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly summaryId: string;
  readonly topicId: string;
  readonly idempotencyKey: string;
  readonly submittedBy: string;
  readonly rating: number;
  readonly category: SummaryFeedbackCategory;
  readonly comment?: string;
  readonly evidence: SummaryFeedbackEvidence;
  readonly triageOwner: SummaryFeedbackTriageOwner;
  readonly eligibleForEvalFixture: boolean;
  readonly createdAt: Date;
};

export class SummaryFeedback {
  private constructor(private readonly props: SummaryFeedbackProps) {}

  static record(props: SummaryFeedbackProps): SummaryFeedback {
    if (props.id.trim().length === 0) {
      throw new Error('Summary feedback id must be non-empty');
    }

    if (props.summaryId.trim().length === 0) {
      throw new Error('Summary feedback summary id must be non-empty');
    }

    if (props.topicId.trim().length === 0) {
      throw new Error('Summary feedback topic id must be non-empty');
    }

    if (props.idempotencyKey.trim().length === 0) {
      throw new Error('Summary feedback idempotency key must be non-empty');
    }

    if (props.submittedBy.trim().length === 0) {
      throw new Error('Summary feedback submitter must be non-empty');
    }

    if (!Number.isInteger(props.rating) || props.rating < 1 || props.rating > 5) {
      throw new Error('Summary feedback rating must be an integer between 1 and 5');
    }

    if (!summaryFeedbackCategories.includes(props.category)) {
      throw new Error('Summary feedback category is unsupported');
    }

    if (props.comment !== undefined && props.comment.length > 2000) {
      throw new Error('Summary feedback comment must be 2000 characters or less');
    }

    if (props.evidence.summaryId !== props.summaryId || props.evidence.topicId !== props.topicId) {
      throw new Error('Summary feedback evidence must reference the same summary and topic');
    }

    if (props.category === 'source_request' && (props.comment ?? '').trim().length === 0) {
      throw new Error('Source request feedback must include a comment with requested source evidence');
    }

    return new SummaryFeedback(props);
  }

  toSnapshot(): SummaryFeedbackProps {
    return { ...this.props };
  }
}

export const isSummaryFeedbackCategory = (value: string): value is SummaryFeedbackCategory =>
  summaryFeedbackCategories.includes(value as SummaryFeedbackCategory);
