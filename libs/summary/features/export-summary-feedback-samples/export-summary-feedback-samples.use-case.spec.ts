import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { InMemorySummaryFeedbackRepository } from '../../adapters/persistence/in-memory-summary-feedback.repository';
import { SummaryFeedback } from '../../domain';
import { ExportSummaryFeedbackSamplesUseCase } from './export-summary-feedback-samples.use-case';

const tenant = tenantId('tenant-export-summary-feedback');
const workspace = workspaceId('workspace-export-summary-feedback');
const otherWorkspace = workspaceId('workspace-export-summary-feedback-other');
const summaryId = 'summary-export-feedback-1';
const topicId = 'topic-export-feedback-1';

describe('ExportSummaryFeedbackSamplesUseCase', () => {
  it('exports redacted release feedback samples from the selected workspace window', async () => {
    const feedback = new InMemorySummaryFeedbackRepository();
    await feedback.save(createFeedback({
      id: 'feedback-export-newer',
      category: 'bad_citation',
      comment: 'This raw comment must not be exported.',
      createdAt: new Date('2026-06-20T10:00:00.000Z'),
    }));
    await feedback.save(createFeedback({
      id: 'feedback-export-older',
      category: 'wrong_fact',
      comment: 'Another raw comment must not be exported.',
      createdAt: new Date('2026-06-19T10:00:00.000Z'),
    }));
    await feedback.save(createFeedback({
      id: 'feedback-export-other-workspace',
      category: 'bad_citation',
      workspaceId: otherWorkspace,
      createdAt: new Date('2026-06-20T10:00:00.000Z'),
    }));
    await feedback.save(createFeedback({
      id: 'feedback-export-too-old',
      category: 'bad_citation',
      createdAt: new Date('2026-06-01T10:00:00.000Z'),
    }));

    const result = await new ExportSummaryFeedbackSamplesUseCase(feedback).execute(baseCommand());

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.samples.map((sample) => sample.feedbackId)).toEqual([
      'feedback-export-newer',
      'feedback-export-older',
    ]);
    expect(result.value.source.sampleCount).toBe(2);
    expect(result.value.source.export).toEqual({
      sourceSystem: 'summary-feedback-api',
      exportId: 'SF-EXPORT-20260620-ALPHA',
      exportedAt: '2026-06-20T12:05:00.000Z',
      reviewQueue: 'summary-quality-review',
      redactionReviewId: 'SEC-REDACTION-4321',
      approvalReference: 'REL-APPROVAL-9876',
    });
    expect(JSON.stringify(result.value)).not.toContain('raw comment');
    expect(result.value.samples[0]).toMatchObject({
      category: 'bad_citation',
      classification: 'blocker',
      severity: 'blocker',
      hardeningAction: {
        actionType: 'validator_change',
        fixtureIds: ['feedback-bad-citation-grounding'],
      },
    });
    expect(result.value.samples[1]).toMatchObject({
      category: 'wrong_fact',
      classification: 'blocker',
      severity: 'blocker',
      hardeningAction: {
        actionType: 'eval_fixture',
        fixtureIds: ['feedback-wrong-fact-grounding'],
      },
    });
  });

  it('rejects blocker feedback missing citation-backed evidence', async () => {
    const feedback = new InMemorySummaryFeedbackRepository();
    await feedback.save(createFeedback({
      id: 'feedback-export-missing-citation',
      category: 'wrong_fact',
      evidence: {
        summaryId,
        topicId,
      },
    }));

    const result = await new ExportSummaryFeedbackSamplesUseCase(feedback).execute(baseCommand());

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.message).toContain('missing citationId');
  });
});

function baseCommand() {
  return {
    tenantId: tenant,
    workspaceId: workspace,
    sampleWindow: {
      startedAt: new Date('2026-06-19T00:00:00.000Z'),
      endedAt: new Date('2026-06-20T12:00:00.000Z'),
    },
    limit: 20,
    source: {
      kind: 'internal_dogfood' as const,
      environmentId: 'summary-dogfood-alpha-1',
      operator: 'summary-owner-1',
      collectionMethod: 'Redacted internal dogfood export collected from summary feedback API review queue.',
      redactedBy: 'summary-owner-1',
      approvedBy: 'security-owner-1',
      export: {
        sourceSystem: 'summary-feedback-api',
        exportId: 'SF-EXPORT-20260620-ALPHA',
        exportedAt: new Date('2026-06-20T12:05:00.000Z'),
        reviewQueue: 'summary-quality-review',
        redactionReviewId: 'SEC-REDACTION-4321',
        approvalReference: 'REL-APPROVAL-9876',
      },
    },
  };
}

function createFeedback(overrides: {
  readonly id: string;
  readonly category: 'wrong_fact' | 'bad_citation';
  readonly workspaceId?: typeof workspace;
  readonly comment?: string;
  readonly evidence?: {
    readonly summaryId: string;
    readonly topicId: string;
    readonly citationId?: string;
    readonly feedItemId?: string;
    readonly sourceItemId?: string;
  };
  readonly createdAt?: Date;
}): SummaryFeedback {
  return SummaryFeedback.record({
    id: overrides.id,
    tenantId: tenant,
    workspaceId: overrides.workspaceId ?? workspace,
    summaryId,
    topicId,
    idempotencyKey: `idempotency:${overrides.id}`,
    submittedBy: 'beta-user-redacted',
    rating: 2,
    category: overrides.category,
    comment: overrides.comment,
    evidence: overrides.evidence ?? {
      summaryId,
      topicId,
      citationId: `citation:${overrides.id}`,
      feedItemId: `feed:${overrides.id}`,
      sourceItemId: `source:${overrides.id}`,
    },
    triageOwner: 'summary-owner',
    eligibleForEvalFixture: true,
    createdAt: overrides.createdAt ?? new Date('2026-06-20T10:00:00.000Z'),
  });
}
