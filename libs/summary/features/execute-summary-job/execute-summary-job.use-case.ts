import {
  type Clock,
  causationId,
  correlationId,
  DomainError,
  eventId,
  type IdGenerator,
  err,
  ok,
  type Result,
} from '@social-monitor/shared-kernel';

import { SummaryArtifact, type SummaryJob, type SummaryReadyEvent } from '../../domain';
import type {
  SummaryArtifactRepositoryPort,
  SummaryEvidenceSelectorPort,
  SummaryEventPublisherPort,
  SummaryJobRepositoryPort,
  SummaryModelBudget,
  SummaryModelPolicy,
  SummaryModelPort,
} from '../../ports';
import type { ExecuteSummaryJobCommand } from './execute-summary-job.command';
import type { ExecuteSummaryJobResult } from './execute-summary-job.result';
import { validateSummaryCitationsAgainstEvidence } from '../shared/summary-citation-validator';

type ExecuteSummaryJobFailure = DomainError | Error;

const defaultModelPolicy: SummaryModelPolicy = {
  preferredProvider: 'deterministic-local',
  maxInputTokens: 12_000,
  maxOutputTokens: 1_500,
  maxEstimatedCostUsd: 0.5,
};

const defaultModelBudget: SummaryModelBudget = {
  remainingTokens: 20_000,
  remainingCostUsd: 1,
};

export class ExecuteSummaryJobUseCase {
  constructor(
    private readonly summaryJobs: SummaryJobRepositoryPort,
    private readonly summaryArtifacts: SummaryArtifactRepositoryPort,
    private readonly evidenceSelector: SummaryEvidenceSelectorPort,
    private readonly summaryModel: SummaryModelPort,
    private readonly events: SummaryEventPublisherPort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(command: ExecuteSummaryJobCommand): Promise<Result<ExecuteSummaryJobResult, ExecuteSummaryJobFailure>> {
    if (command.summaryJobId.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Summary job id must be non-empty'));
    }

    const job = await this.summaryJobs.findById({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      summaryJobId: command.summaryJobId,
    });

    if (job === null) {
      return err(new DomainError('resource.not_found', 'Summary job was not found'));
    }

    const snapshot = job.toSnapshot();
    if (snapshot.status === 'completed' || snapshot.status === 'no_signal') {
      return ok({
        summaryJobId: snapshot.id,
        status: snapshot.status,
        summaryId: snapshot.summaryId,
      });
    }

    if (snapshot.status === 'running') {
      return err(new DomainError('operation.conflict', 'Summary job is already running'));
    }

    if (snapshot.status === 'failed') {
      return err(new DomainError('operation.conflict', 'Failed summary job retry is not implemented yet'));
    }

    const runningJob = job.start({ startedAt: this.clock.now() });
    await this.summaryJobs.save(runningJob);

    try {
      const result = await this.runModelPipeline(runningJob, command.maxEvidenceItems ?? 20);
      await this.summaryArtifacts.save(result.artifact);

      const artifactSnapshot = result.artifact.toSnapshot();
      const finalJob = artifactSnapshot.qualityFlags.includes('no_signal')
        ? runningJob.markNoSignal({
            completedAt: this.clock.now(),
            summaryId: artifactSnapshot.summaryId,
          })
        : runningJob.complete({
            completedAt: this.clock.now(),
            summaryId: artifactSnapshot.summaryId,
      });
      await this.summaryJobs.save(finalJob);

      const finalSnapshot = finalJob.toSnapshot();
      await this.events.publish({
        eventId: eventId(this.ids.generate()),
        eventType: 'summary.ready',
        schemaVersion: 1,
        occurredAt: this.clock.now(),
        tenantId: finalSnapshot.tenantId,
        workspaceId: finalSnapshot.workspaceId,
        correlationId: correlationId(command.summaryJobId),
        causationId: causationId(finalSnapshot.id),
        payload: {
          summaryJobId: finalSnapshot.id,
          summaryId: artifactSnapshot.summaryId,
          tenantId: finalSnapshot.tenantId,
          workspaceId: finalSnapshot.workspaceId,
          topicId: finalSnapshot.topicId,
          status: finalSnapshot.status === 'no_signal' ? 'no_signal' : 'completed',
        },
      } satisfies SummaryReadyEvent);

      return ok({
        summaryJobId: finalSnapshot.id,
        status: finalSnapshot.status,
        summaryId: finalSnapshot.summaryId,
      });
    } catch (error) {
      const failure = this.summaryModel.classifyError(error);
      const failedJob = runningJob.fail({
        failedAt: this.clock.now(),
        failureReason: failure.message,
      });
      await this.summaryJobs.save(failedJob);

      return err(new DomainError('external.dependency_unavailable', failure.message, { kind: failure.kind }));
    }
  }

  private async runModelPipeline(
    job: SummaryJob,
    maxEvidenceItems: number,
  ): Promise<{ readonly artifact: SummaryArtifact }> {
    const snapshot = job.toSnapshot();
    const evidence = await this.evidenceSelector.select({
      tenantId: snapshot.tenantId,
      workspaceId: snapshot.workspaceId,
      topicId: snapshot.topicId,
      maxItems: maxEvidenceItems,
    });
    const input = {
      tenantId: snapshot.tenantId,
      workspaceId: snapshot.workspaceId,
      topicId: snapshot.topicId,
      evidence,
      requestedAt: snapshot.requestedAt,
    };
    const route = this.summaryModel.route(input, defaultModelPolicy, defaultModelBudget);
    const attempt = await this.summaryModel.summarize(input, route);
    const validation = this.summaryModel.validateRawProviderResponse(attempt);

    if (!validation.ok) {
      throw new Error(validation.failure.message);
    }

    validateSummaryCitationsAgainstEvidence(attempt.draft, evidence);

    const artifact = SummaryArtifact.create({
      schemaVersion: 'summary.artifact.v1',
      summaryId: this.ids.generate(),
      tenantId: snapshot.tenantId,
      workspaceId: snapshot.workspaceId,
      topicId: snapshot.topicId,
      sourceWindow: evidence.sourceWindow,
      ...attempt.draft,
    });

    return { artifact };
  }
}
