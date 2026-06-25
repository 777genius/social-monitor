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

import {
  defaultSummaryGenerationPolicy,
  resolveEffectiveSummaryPolicy,
  SummaryArtifact,
  type SummaryJob,
  type SummaryReadyEvent,
} from '../../domain';
import {
  NOOP_SUMMARY_MEMORY,
  type SummaryArtifactRepositoryPort,
  type SummaryEvidenceSelection,
  type SummaryEvidenceSelectorPort,
  type SummaryEventPublisherPort,
  type SummaryJobRepositoryPort,
  type SummaryModelBudget,
  type SummaryModelFailure,
  type SummaryModelPolicy,
  type SummaryModelPort,
  type SummaryMemoryContext,
  type SummaryMemoryPort,
  type SummaryPolicyRepositoryPort,
  type UserSummaryPreferenceReaderPort,
} from '../../ports';
import type { ExecuteSummaryJobCommand } from './execute-summary-job.command';
import type { ExecuteSummaryJobResult } from './execute-summary-job.result';
import { validateSummaryCitationsAgainstEvidence } from '../shared/summary-citation-validator';

type ExecuteSummaryJobFailure = DomainError | Error;
type SummaryModelPipelineResult = Result<{ readonly artifact: SummaryArtifact }, SummaryModelFailure>;

const defaultModelPolicy: SummaryModelPolicy = {
  preferredProvider: 'deterministic-local',
  maxInputTokens: 12_000,
  maxOutputTokens: 4_000,
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
    private readonly summaryPolicies: SummaryPolicyRepositoryPort,
    private readonly userSummaryPreferences: UserSummaryPreferenceReaderPort,
    private readonly evidenceSelector: SummaryEvidenceSelectorPort,
    private readonly summaryModel: SummaryModelPort,
    private readonly events: SummaryEventPublisherPort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly memory: SummaryMemoryPort = NOOP_SUMMARY_MEMORY,
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

    const executableJob = snapshot.status === 'failed'
      ? job.retry({ requestedAt: this.clock.now() })
      : job;
    const runningJob = executableJob.start({ startedAt: this.clock.now() });
    await this.summaryJobs.save(runningJob);

    try {
      const result = await this.runModelPipeline(runningJob, command.maxEvidenceItems ?? 20);

      if (!result.ok) {
        const failedJob = runningJob.fail({
          failedAt: this.clock.now(),
          failureReason: result.error.message,
        });
        await this.summaryJobs.save(failedJob);

        return err(new DomainError('external.dependency_unavailable', result.error.message, {
          kind: result.error.kind,
        }));
      }

      await this.summaryArtifacts.save(result.value.artifact);

      const artifactSnapshot = result.value.artifact.toSnapshot();
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
          userId: finalSnapshot.userId,
          subscriptionId: finalSnapshot.subscriptionId,
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
  ): Promise<SummaryModelPipelineResult> {
    const snapshot = job.toSnapshot();
    const evidence = await this.evidenceSelector.select({
      tenantId: snapshot.tenantId,
      workspaceId: snapshot.workspaceId,
      topicId: snapshot.topicId,
      userId: snapshot.userId,
      subscriptionId: snapshot.subscriptionId,
      maxItems: maxEvidenceItems,
    });
    const summaryPolicy = await this.summaryPolicies.findByTopic({
      tenantId: snapshot.tenantId,
      workspaceId: snapshot.workspaceId,
      topicId: snapshot.topicId,
    });
    const userPreference = snapshot.userId === undefined
      ? null
      : await this.userSummaryPreferences.findEffectivePreference({
          tenantId: snapshot.tenantId,
          workspaceId: snapshot.workspaceId,
          userId: snapshot.userId,
          subscriptionId: snapshot.subscriptionId,
          topicId: snapshot.topicId,
        });
    const basePolicy = summaryPolicy?.toGenerationPolicy() ?? defaultSummaryGenerationPolicy();
    const memoryContext = await this.safeBuildMemoryContext(snapshot, evidence);
    const input = {
      tenantId: snapshot.tenantId,
      workspaceId: snapshot.workspaceId,
      topicId: snapshot.topicId,
      userId: snapshot.userId,
      subscriptionId: snapshot.subscriptionId,
      evidence,
      memoryContext,
      policy: resolveEffectiveSummaryPolicy(basePolicy, userPreference),
      requestedAt: snapshot.requestedAt,
    };
    const route = this.summaryModel.route(input, defaultModelPolicy, defaultModelBudget);
    const attempt = await this.summaryModel.summarize(input, route);
    const validation = this.summaryModel.validateRawProviderResponse(attempt);

    if (!validation.ok) {
      return err(validation.failure);
    }

    try {
      validateSummaryCitationsAgainstEvidence(attempt.draft, evidence);
    } catch (error) {
      return err(this.summaryModel.classifyError(error));
    }

    const artifact = SummaryArtifact.create({
      schemaVersion: 'summary.artifact.v1',
      summaryId: this.ids.generate(),
      tenantId: snapshot.tenantId,
      workspaceId: snapshot.workspaceId,
      topicId: snapshot.topicId,
      userId: snapshot.userId,
      subscriptionId: snapshot.subscriptionId,
      sourceWindow: evidence.sourceWindow,
      ...attempt.draft,
    });

    return ok({ artifact });
  }

  private async safeBuildMemoryContext(
    snapshot: ReturnType<SummaryJob['toSnapshot']>,
    evidence: SummaryEvidenceSelection,
  ): Promise<SummaryMemoryContext> {
    try {
      return await this.memory.buildContext({
        tenantId: snapshot.tenantId,
        workspaceId: snapshot.workspaceId,
        topicId: snapshot.topicId,
        userId: snapshot.userId,
        subscriptionId: snapshot.subscriptionId,
        evidence,
        requestedAt: snapshot.requestedAt,
      });
    } catch (error) {
      return {
        status: 'unavailable',
        diagnostics: {
          code: 'summary.memory.unavailable',
          message: safeMemoryErrorMessage(error),
        },
        retrievedAt: this.clock.now(),
      };
    }
  }
}

const safeMemoryErrorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : 'Summary memory context unavailable';

  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/([?&](?:token|api_key|apikey|secret|password)=)[^&\s]+/gi, '$1[REDACTED]')
    .slice(0, 240);
};
