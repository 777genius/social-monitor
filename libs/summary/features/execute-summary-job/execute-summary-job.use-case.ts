import {
  type Clock,
  causationId,
  correlationId,
  DomainError,
  eventId,
  type IdGenerator,
  err,
  ok,
  redactSensitiveText,
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
  type SummaryExecutionClaim,
  type SummaryExecutionWorkflowPort,
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
    private readonly executionWorkflow: SummaryExecutionWorkflowPort,
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

    let execution: SummaryExecutionClaim | null;
    try {
      execution = await this.executionWorkflow.tryStart({
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        summaryJobId: command.summaryJobId,
        startedAt: this.clock.now(),
      });
    } catch {
      return err(new DomainError('external.dependency_unavailable', 'Summary execution start could not be confirmed', {
        kind: 'summary.claim_unconfirmed',
      }));
    }
    if (execution === null) {
      return err(new DomainError('operation.conflict', 'Summary job was claimed or changed by another execution'));
    }

    let result: SummaryModelPipelineResult;
    try {
      result = await this.runModelPipeline(execution.job, command.maxEvidenceItems ?? 20);
    } catch (error) {
      return this.failExecution(execution, this.summaryModel.classifyError(error));
    }
    if (!result.ok) return this.failExecution(execution, result.error);

    // A persistence failure after a paid model call is not a model failure.
    // Its outcome remains visible for reconciliation; it never triggers a new call.
    return this.completeExecution(execution, result.value.artifact);
  }

  private async failExecution(
    execution: SummaryExecutionClaim,
    failure: SummaryModelFailure,
  ): Promise<Result<ExecuteSummaryJobResult, ExecuteSummaryJobFailure>> {
    const message = redactSensitiveText(failure.message).slice(0, 240);
    try {
      const saved = await this.executionWorkflow.fail({
        execution, failedAt: this.clock.now(), failureReason: message,
      });
      if (!saved) {
        return err(new DomainError('operation.conflict', 'Summary execution no longer owns the running job'));
      }
    } catch {
      return err(new DomainError('external.dependency_unavailable', 'Summary failure could not be persisted', {
        kind: 'summary.failure_unconfirmed',
      }));
    }
    return err(new DomainError('external.dependency_unavailable', message, { kind: failure.kind }));
  }

  private async completeExecution(
    execution: SummaryExecutionClaim,
    artifact: SummaryArtifact,
  ): Promise<Result<ExecuteSummaryJobResult, ExecuteSummaryJobFailure>> {
    const job = execution.job.toSnapshot();
    const artifactSnapshot = artifact.toSnapshot();
    const completedAt = this.clock.now();
    const status = artifactSnapshot.qualityFlags.includes('no_signal') ? 'no_signal' : 'completed';
    const event: SummaryReadyEvent = {
      eventId: eventId(this.ids.generate()),
      eventType: 'summary.ready',
      schemaVersion: 1,
      occurredAt: completedAt,
      tenantId: job.tenantId,
      workspaceId: job.workspaceId,
      correlationId: correlationId(job.id),
      causationId: causationId(job.id),
      payload: {
        summaryJobId: job.id,
        summaryId: artifactSnapshot.summaryId,
        tenantId: job.tenantId,
        workspaceId: job.workspaceId,
        interestId: job.interestId,
        userId: job.userId,
        subscriptionId: job.subscriptionId,
        status,
      },
    };
    try {
      const completed = await this.executionWorkflow.complete({ execution, artifact, event, completedAt });
      if (completed !== null) return ok(presentJob(completed));
      const confirmed = await this.confirmCompletion(execution, artifact, status);
      return confirmed === null
        ? err(new DomainError('operation.conflict', 'Summary execution no longer owns the running job'))
        : ok(presentJob(confirmed));
    } catch {
      const confirmed = await this.confirmCompletion(execution, artifact, status);
      if (confirmed !== null) return ok(presentJob(confirmed));
      return err(new DomainError('external.dependency_unavailable', 'Summary completion could not be confirmed', {
        kind: 'summary.finalization_unconfirmed',
      }));
    }
  }

  /** A lost commit acknowledgement can be resolved only by this exact artifact. */
  private async confirmCompletion(
    execution: SummaryExecutionClaim,
    artifact: SummaryArtifact,
    expectedStatus: 'completed' | 'no_signal',
  ): Promise<SummaryJob | null> {
    const expected = execution.job.toSnapshot();
    const intended = artifact.toSnapshot();
    try {
      const job = await this.summaryJobs.findById({
        tenantId: expected.tenantId, workspaceId: expected.workspaceId, summaryJobId: expected.id,
      });
      const current = job?.toSnapshot();
      if (current?.status !== expectedStatus || current.id !== expected.id ||
          current.tenantId !== expected.tenantId || current.workspaceId !== expected.workspaceId ||
          current.summaryId !== intended.summaryId) return null;
      const stored = (await this.summaryArtifacts.findById({
        tenantId: expected.tenantId, workspaceId: expected.workspaceId, summaryId: intended.summaryId,
      }))?.toSnapshot();
      if (stored?.summaryId !== intended.summaryId || stored.tenantId !== expected.tenantId ||
          stored.workspaceId !== expected.workspaceId || stored.interestId !== expected.interestId ||
          stored.userId !== expected.userId || stored.subscriptionId !== expected.subscriptionId) return null;
      return job;
    } catch {
      return null;
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
      interestId: snapshot.interestId,
      userId: snapshot.userId,
      subscriptionId: snapshot.subscriptionId,
      maxItems: maxEvidenceItems,
    });
    const summaryPolicy = await this.summaryPolicies.findByInterest({
      tenantId: snapshot.tenantId,
      workspaceId: snapshot.workspaceId,
      interestId: snapshot.interestId,
    });
    const userPreference = snapshot.userId === undefined
      ? null
      : await this.userSummaryPreferences.findEffectivePreference({
          tenantId: snapshot.tenantId,
          workspaceId: snapshot.workspaceId,
          userId: snapshot.userId,
          subscriptionId: snapshot.subscriptionId,
          interestId: snapshot.interestId,
        });
    const basePolicy = summaryPolicy?.toGenerationPolicy() ?? defaultSummaryGenerationPolicy();
    const memoryContext = await this.safeBuildMemoryContext(snapshot, evidence);
    const input = {
      tenantId: snapshot.tenantId,
      workspaceId: snapshot.workspaceId,
      interestId: snapshot.interestId,
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
      ...attempt.draft,
      schemaVersion: 'summary.artifact.v1',
      summaryId: this.ids.generate(),
      tenantId: snapshot.tenantId,
      workspaceId: snapshot.workspaceId,
      interestId: snapshot.interestId,
      userId: snapshot.userId,
      subscriptionId: snapshot.subscriptionId,
      sourceWindow: evidence.sourceWindow,
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
        interestId: snapshot.interestId,
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

  return redactSensitiveText(message).slice(0, 240);
};

const presentJob = (job: SummaryJob): ExecuteSummaryJobResult => {
  const snapshot = job.toSnapshot();
  return { summaryJobId: snapshot.id, status: snapshot.status, summaryId: snapshot.summaryId };
};
