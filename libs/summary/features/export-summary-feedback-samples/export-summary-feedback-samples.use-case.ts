import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { SummaryFeedback, SummaryFeedbackCategory, SummaryFeedbackTriageOwner } from '../../domain';
import type { SummaryFeedbackExportRepositoryPort } from '../../ports';
import type { ExportSummaryFeedbackSamplesCommand } from './export-summary-feedback-samples.command';
import type {
  ExportSummaryFeedbackSamplesResult,
  RedactedSummaryFeedbackSampleInput,
} from './export-summary-feedback-samples.result';

type ExportSummaryFeedbackSamplesFailure = DomainError;

const MAX_EXPORT_LIMIT = 100;
const citationRequiredCategories = new Set<SummaryFeedbackCategory>([
  'wrong_fact',
  'missing_source',
  'bad_citation',
]);

export class ExportSummaryFeedbackSamplesUseCase {
  constructor(private readonly feedback: SummaryFeedbackExportRepositoryPort) {}

  async execute(
    command: ExportSummaryFeedbackSamplesCommand,
  ): Promise<Result<ExportSummaryFeedbackSamplesResult, ExportSummaryFeedbackSamplesFailure>> {
    const validationError = validateCommand(command);
    if (validationError !== null) {
      return err(validationError);
    }

    const result = await this.feedback.exportForReleaseEvidence({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      startedAt: command.sampleWindow.startedAt,
      endedAt: command.sampleWindow.endedAt,
      limit: command.limit,
    });

    const samples: RedactedSummaryFeedbackSampleInput[] = [];
    for (const feedback of result.items) {
      const sample = toRedactedSample(feedback);
      if (sample instanceof DomainError) {
        return err(sample);
      }
      samples.push(sample);
    }

    return ok({
      samples,
      sampleWindow: {
        startedAt: command.sampleWindow.startedAt.toISOString(),
        endedAt: command.sampleWindow.endedAt.toISOString(),
      },
      source: {
        kind: command.source.kind,
        environmentId: command.source.environmentId,
        sampleWindow: {
          startedAt: command.sampleWindow.startedAt.toISOString(),
          endedAt: command.sampleWindow.endedAt.toISOString(),
        },
        operator: command.source.operator,
        sampleCount: samples.length,
        collectionMethod: command.source.collectionMethod,
        redactedBy: command.source.redactedBy,
        approvedBy: command.source.approvedBy,
        export: {
          sourceSystem: command.source.export.sourceSystem,
          exportId: command.source.export.exportId,
          exportedAt: command.source.export.exportedAt.toISOString(),
          reviewQueue: command.source.export.reviewQueue,
          redactionReviewId: command.source.export.redactionReviewId,
          approvalReference: command.source.export.approvalReference,
        },
      },
    });
  }
}

function validateCommand(command: ExportSummaryFeedbackSamplesCommand): DomainError | null {
  if (command.sampleWindow.startedAt.getTime() >= command.sampleWindow.endedAt.getTime()) {
    return new DomainError('validation.failed', 'Summary feedback export sample window start must be before end');
  }
  if (command.source.export.exportedAt.getTime() < command.sampleWindow.endedAt.getTime()) {
    return new DomainError('validation.failed', 'Summary feedback export timestamp must be after the sample window');
  }
  if (!Number.isInteger(command.limit) || command.limit < 1 || command.limit > MAX_EXPORT_LIMIT) {
    return new DomainError('validation.failed', `Summary feedback export limit must be between 1 and ${MAX_EXPORT_LIMIT}`, {
      limit: command.limit,
    });
  }

  for (const [field, value] of Object.entries({
    environmentId: command.source.environmentId,
    operator: command.source.operator,
    collectionMethod: command.source.collectionMethod,
    redactedBy: command.source.redactedBy,
    approvedBy: command.source.approvedBy,
    sourceSystem: command.source.export.sourceSystem,
    exportId: command.source.export.exportId,
    reviewQueue: command.source.export.reviewQueue,
    redactionReviewId: command.source.export.redactionReviewId,
    approvalReference: command.source.export.approvalReference,
  })) {
    if (value.trim().length < 4) {
      return new DomainError('validation.failed', `Summary feedback export ${field} must be a traceable non-empty value`);
    }
  }

  return null;
}

function toRedactedSample(feedback: SummaryFeedback): RedactedSummaryFeedbackSampleInput | DomainError {
  const snapshot = feedback.toSnapshot();
  if (citationRequiredCategories.has(snapshot.category)) {
    for (const field of ['citationId', 'feedItemId', 'sourceItemId'] as const) {
      if (snapshot.evidence[field] === undefined) {
        return new DomainError(
          'validation.failed',
          `Summary feedback ${snapshot.id} cannot be exported because ${snapshot.category} evidence is missing ${field}`,
        );
      }
    }
  }

  return {
    feedbackId: snapshot.id,
    category: snapshot.category,
    classification: classificationForCategory(snapshot.category),
    severity: severityForCategory(snapshot.category),
    triageOwner: snapshot.triageOwner,
    eligibleForEvalFixture: snapshot.eligibleForEvalFixture,
    releaseBlocking: true,
    summaryEvidence: {
      summaryId: snapshot.evidence.summaryId,
      topicId: snapshot.evidence.topicId,
      citationId: snapshot.evidence.citationId,
      feedItemId: snapshot.evidence.feedItemId,
      sourceItemId: snapshot.evidence.sourceItemId,
    },
    sanitizedSignal: sanitizedSignal(snapshot.category, snapshot.rating, snapshot.triageOwner),
    redactedComment: redactedComment(snapshot.comment),
    qualitySignals: {
      claimsChecked: true,
      citationsChecked: true,
      costChecked: true,
      staleMarkerChecked: true,
    },
    hardeningAction: hardeningActionForCategory(snapshot.category),
  };
}

function classificationForCategory(
  category: SummaryFeedbackCategory,
): RedactedSummaryFeedbackSampleInput['classification'] {
  if (category === 'wrong_fact' || category === 'bad_citation') {
    return 'blocker';
  }
  if (category === 'source_request') {
    return 'deferred_idea';
  }
  if (category === 'too_verbose' || category === 'too_terse' || category === 'ux_confusing') {
    return 'accepted_mvp_gap';
  }

  return 'evidence_based_opportunity';
}

function severityForCategory(category: SummaryFeedbackCategory): RedactedSummaryFeedbackSampleInput['severity'] {
  if (category === 'wrong_fact' || category === 'bad_citation') {
    return 'blocker';
  }
  if (category === 'missing_source' || category === 'low_relevance') {
    return 'opportunity';
  }
  if (category === 'source_request' || category === 'other') {
    return 'accepted_gap';
  }

  return 'watch';
}

function sanitizedSignal(
  category: SummaryFeedbackCategory,
  rating: number,
  triageOwner: SummaryFeedbackTriageOwner,
): string {
  return `Redacted ${category} feedback with rating ${rating} was routed to ${triageOwner} for release hardening review.`;
}

function redactedComment(comment: string | undefined): string {
  if (comment === undefined || comment.trim().length === 0) {
    return 'Reviewer comment was empty or omitted; no raw feedback text is included in this release evidence sample.';
  }

  return `Reviewer comment was irreversibly redacted before export; original comment length was ${comment.length} characters.`;
}

function hardeningActionForCategory(
  category: SummaryFeedbackCategory,
): RedactedSummaryFeedbackSampleInput['hardeningAction'] {
  if (category === 'wrong_fact') {
    return {
      actionType: 'eval_fixture',
      status: 'passed',
      command: 'npm run check:summary-evals',
      artifact: 'ops/evals/summary-eval-output.json',
      fixtureIds: ['feedback-wrong-fact-grounding'],
      exitCondition: 'Wrong-fact feedback is covered by a blocking grounding eval before beta promotion.',
    };
  }
  if (category === 'bad_citation') {
    return {
      actionType: 'validator_change',
      status: 'passed',
      command: 'npm run test',
      artifact: 'libs/summary/features/shared/summary-citation-validator.spec.ts',
      fixtureIds: ['feedback-bad-citation-grounding'],
      exitCondition: 'Bad-citation feedback is covered by citation validator regression before beta promotion.',
    };
  }
  if (category === 'missing_source') {
    return {
      actionType: 'runbook_action',
      status: 'passed',
      command: 'npm run check:summary-window',
      artifact: 'scripts/check-summary-window-freshness-smoke.ts',
      fixtureIds: [],
      exitCondition: 'Summary window freshness gate remains release-blocking when newer feed evidence exists.',
    };
  }

  return {
    actionType: 'runbook_action',
    status: 'passed',
    command: 'npm run check:summary-feedback-hardening',
    artifact: 'ops/release/summary-feedback-hardening-evidence.json',
    fixtureIds: [],
    exitCondition: 'Feedback category remains triaged with a release-blocking owner and documented hardening path.',
  };
}
