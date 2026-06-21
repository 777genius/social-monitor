import {
  type Clock,
  DomainError,
  err,
  type IdGenerator,
  ok,
  type Result,
} from '@social-monitor/shared-kernel';

import {
  isSummaryFeedbackCategory,
  SummaryFeedback,
  type SummaryFeedbackCategory,
  type SummaryFeedbackEvidence,
  type SummaryFeedbackTriageOwner,
} from '../../domain';
import type { SummaryArtifactRepositoryPort, SummaryFeedbackRepositoryPort } from '../../ports';
import type { RecordSummaryFeedbackCommand } from './record-summary-feedback.command';
import type { RecordSummaryFeedbackResult } from './record-summary-feedback.result';

type RecordSummaryFeedbackFailure = DomainError | Error;

const evalFixtureCategories = new Set<SummaryFeedbackCategory>([
  'wrong_fact',
  'missing_source',
  'bad_citation',
  'low_relevance',
]);

export class RecordSummaryFeedbackUseCase {
  constructor(
    private readonly summaries: SummaryArtifactRepositoryPort,
    private readonly feedback: SummaryFeedbackRepositoryPort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(
    command: RecordSummaryFeedbackCommand,
  ): Promise<Result<RecordSummaryFeedbackResult, RecordSummaryFeedbackFailure>> {
    const cached = await this.feedback.findByIdempotencyKey({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      idempotencyKey: command.idempotencyKey,
    });

    if (cached !== null) {
      return ok(presentFeedback(cached, false));
    }

    if (command.summaryId.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Summary id must be non-empty'));
    }

    if (command.idempotencyKey.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Feedback idempotency key must be non-empty'));
    }

    if (command.submittedBy.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Feedback submitter must be non-empty'));
    }

    if (!Number.isInteger(command.rating) || command.rating < 1 || command.rating > 5) {
      return err(new DomainError('validation.failed', 'Feedback rating must be an integer between 1 and 5', {
        rating: command.rating,
      }));
    }

    if (!isSummaryFeedbackCategory(command.category)) {
      return err(new DomainError('validation.failed', 'Feedback category is unsupported', {
        category: command.category,
      }));
    }

    const normalizedComment = normalizeComment(command.comment);
    if (normalizedComment !== undefined && normalizedComment.length > 2000) {
      return err(new DomainError('validation.failed', 'Feedback comment must be 2000 characters or less'));
    }

    if (command.category === 'source_request' && normalizedComment === undefined) {
      return err(new DomainError('validation.failed', 'Source request feedback must include requested source evidence'));
    }

    const summary = await this.summaries.findById({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      summaryId: command.summaryId,
    });

    if (summary === null) {
      return err(new DomainError('resource.not_found', 'Summary not found', {
        summaryId: command.summaryId,
      }));
    }

    const summarySnapshot = summary.toSnapshot();
    const citation = normalizeCitationId(command.citationId) === undefined
      ? undefined
      : summarySnapshot.citationMap.find((item) => item.citationId === normalizeCitationId(command.citationId));
    if (normalizeCitationId(command.citationId) !== undefined && citation === undefined) {
      return err(new DomainError('validation.failed', 'Feedback citation must belong to the summary', {
        summaryId: command.summaryId,
        citationId: command.citationId,
      }));
    }

    const feedback = SummaryFeedback.record({
      id: this.ids.generate(),
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      summaryId: command.summaryId,
      topicId: summarySnapshot.topicId,
      idempotencyKey: command.idempotencyKey,
      submittedBy: command.submittedBy.trim(),
      rating: command.rating,
      category: command.category,
      comment: normalizedComment,
      evidence: {
        summaryId: command.summaryId,
        topicId: summarySnapshot.topicId,
        citationId: citation?.citationId,
        feedItemId: citation?.feedItemId,
        sourceItemId: citation?.sourceItemId,
        providerKey: citation?.providerKey,
      },
      triageOwner: triageOwnerFor(command.category),
      eligibleForEvalFixture: isEligibleForEvalFixture(command.category, normalizedComment, citation?.citationId),
      createdAt: this.clock.now(),
    });

    await this.feedback.save(feedback);

    return ok(presentFeedback(feedback, true));
  }
}

const normalizeComment = (value: string | undefined): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed.length === 0 ? undefined : trimmed;
};

const normalizeCitationId = (value: string | undefined): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed.length === 0 ? undefined : trimmed;
};

const triageOwnerFor = (category: SummaryFeedbackCategory): SummaryFeedbackTriageOwner => {
  if (category === 'source_request') {
    return 'source-owner';
  }

  if (category === 'ux_confusing' || category === 'too_verbose' || category === 'too_terse') {
    return 'product-owner';
  }

  if (category === 'other') {
    return 'support-owner';
  }

  return 'summary-owner';
};

const isEligibleForEvalFixture = (
  category: SummaryFeedbackCategory,
  comment: string | undefined,
  citationId: string | undefined,
): boolean =>
  evalFixtureCategories.has(category) && (comment !== undefined || citationId !== undefined);

const presentFeedback = (feedback: SummaryFeedback, created: boolean): RecordSummaryFeedbackResult => {
  const snapshot = feedback.toSnapshot();
  const evidence: SummaryFeedbackEvidence = {
    summaryId: snapshot.evidence.summaryId,
    topicId: snapshot.evidence.topicId,
    citationId: snapshot.evidence.citationId,
    feedItemId: snapshot.evidence.feedItemId,
    sourceItemId: snapshot.evidence.sourceItemId,
    providerKey: snapshot.evidence.providerKey,
  };

  return {
    feedbackId: snapshot.id,
    created,
    category: snapshot.category,
    triageOwner: snapshot.triageOwner,
    evidence,
    eligibleForEvalFixture: snapshot.eligibleForEvalFixture,
    createdAt: snapshot.createdAt.toISOString(),
  };
};
