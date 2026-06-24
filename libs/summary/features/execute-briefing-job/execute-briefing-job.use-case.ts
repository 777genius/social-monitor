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
  assertBriefingCitationsAgainstEvidence,
  BriefingArtifact,
  type BriefingContextArtifact,
  type BriefingEvidenceSelection,
  type BriefingJob,
  type BriefingReadyEvent,
  defaultBriefingGenerationPolicy,
} from '../../domain';
import {
  NOOP_BRIEFING_CONTEXT_PROVIDER,
  type BriefingArtifactRepositoryPort,
  type BriefingContextProviderPort,
  type BriefingEvidenceSelectorPort,
  type BriefingJobRepositoryPort,
  type BriefingModelBudget,
  type BriefingModelFailure,
  type BriefingModelPolicy,
  type BriefingModelPort,
  type BriefingPolicyRepositoryPort,
  type ProviderBriefingAttempt,
  type SummaryEventPublisherPort,
} from '../../ports';
import type { ExecuteBriefingJobCommand } from './execute-briefing-job.command';
import type { ExecuteBriefingJobResult } from './execute-briefing-job.result';

type ExecuteBriefingJobFailure = DomainError | Error;
type BriefingModelPipelineResult = Result<{ readonly artifact: BriefingArtifact }, BriefingModelFailure>;
type BriefingContextBuildResult = {
  readonly artifacts: readonly BriefingContextArtifact[];
  readonly unavailable: boolean;
};

const defaultModelPolicy: BriefingModelPolicy = {
  preferredProvider: 'deterministic-local',
  maxInputTokens: 24_000,
  maxOutputTokens: 2_500,
  maxEstimatedCostUsd: 1,
};

const defaultModelBudget: BriefingModelBudget = {
  remainingTokens: 32_000,
  remainingCostUsd: 2,
};

export class ExecuteBriefingJobUseCase {
  constructor(
    private readonly briefingJobs: BriefingJobRepositoryPort,
    private readonly briefingArtifacts: BriefingArtifactRepositoryPort,
    private readonly briefingPolicies: BriefingPolicyRepositoryPort,
    private readonly evidenceSelector: BriefingEvidenceSelectorPort,
    private readonly briefingModel: BriefingModelPort,
    private readonly events: SummaryEventPublisherPort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly contextProvider: BriefingContextProviderPort = NOOP_BRIEFING_CONTEXT_PROVIDER,
  ) {}

  async execute(command: ExecuteBriefingJobCommand): Promise<Result<ExecuteBriefingJobResult, ExecuteBriefingJobFailure>> {
    if (command.briefingJobId.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Briefing job id must be non-empty'));
    }

    const existingJob = await this.briefingJobs.findById({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      briefingJobId: command.briefingJobId,
    });

    if (existingJob === null) {
      return err(new DomainError('resource.not_found', 'Briefing job was not found'));
    }

    const snapshot = existingJob.toSnapshot();
    if (snapshot.status === 'completed' || snapshot.status === 'no_signal') {
      return ok({
        briefingJobId: snapshot.id,
        status: snapshot.status,
        briefingId: snapshot.briefingId,
      });
    }

    if (snapshot.status === 'running') {
      return err(new DomainError('operation.conflict', 'Briefing job is already running'));
    }

    const startedAt = this.clock.now();
    const runningJob = await this.briefingJobs.claimForExecution({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      briefingJobId: command.briefingJobId,
      requestedAt: startedAt,
      startedAt,
    });

    if (runningJob === null) {
      return err(new DomainError('operation.conflict', 'Briefing job was claimed by another worker'));
    }

    try {
      const result = await this.runModelPipeline(runningJob, command.maxEvidenceItems ?? 20);

      if (!result.ok) {
        const failedJob = runningJob.fail({
          failedAt: this.clock.now(),
          failureReason: result.error.message,
        });
        await this.briefingJobs.save(failedJob);

        return err(new DomainError('external.dependency_unavailable', result.error.message, {
          kind: result.error.kind,
        }));
      }

      await this.briefingArtifacts.save(result.value.artifact);

      const artifactSnapshot = result.value.artifact.toSnapshot();
      const finalJob = artifactSnapshot.qualityFlags.includes('no_signal')
        ? runningJob.markNoSignal({
            completedAt: this.clock.now(),
            briefingId: artifactSnapshot.briefingId,
          })
        : runningJob.complete({
            completedAt: this.clock.now(),
            briefingId: artifactSnapshot.briefingId,
          });
      await this.briefingJobs.save(finalJob);

      const finalSnapshot = finalJob.toSnapshot();
      await this.events.publish({
        eventId: eventId(this.ids.generate()),
        eventType: 'briefing.ready',
        schemaVersion: 1,
        occurredAt: this.clock.now(),
        tenantId: finalSnapshot.tenantId,
        workspaceId: finalSnapshot.workspaceId,
        correlationId: correlationId(command.briefingJobId),
        causationId: causationId(finalSnapshot.id),
        payload: {
          briefingJobId: finalSnapshot.id,
          briefingId: artifactSnapshot.briefingId,
          tenantId: finalSnapshot.tenantId,
          workspaceId: finalSnapshot.workspaceId,
          scope: finalSnapshot.scope,
          userId: finalSnapshot.userId,
          subscriptionId: finalSnapshot.subscriptionId,
          status: finalSnapshot.status === 'no_signal' ? 'no_signal' : 'completed',
        },
      } satisfies BriefingReadyEvent);

      return ok({
        briefingJobId: finalSnapshot.id,
        status: finalSnapshot.status,
        briefingId: finalSnapshot.briefingId,
      });
    } catch (error) {
      const failure = this.briefingModel.classifyError(error);
      const failedJob = runningJob.fail({
        failedAt: this.clock.now(),
        failureReason: failure.message,
      });
      await this.briefingJobs.save(failedJob);

      return err(new DomainError('external.dependency_unavailable', failure.message, { kind: failure.kind }));
    }
  }

  private async runModelPipeline(
    job: BriefingJob,
    maxEvidenceItems: number,
  ): Promise<BriefingModelPipelineResult> {
    const snapshot = job.toSnapshot();
    const evidence = await this.evidenceSelector.select({
      tenantId: snapshot.tenantId,
      workspaceId: snapshot.workspaceId,
      scope: snapshot.scope,
      userId: snapshot.userId,
      subscriptionId: snapshot.subscriptionId,
      maxItems: maxEvidenceItems,
    });
    const policy = await this.briefingPolicies.findByScope({
      tenantId: snapshot.tenantId,
      workspaceId: snapshot.workspaceId,
      scope: snapshot.scope,
    });
    const context = await this.safeBuildContext(snapshot, evidence);
    const input = {
      tenantId: snapshot.tenantId,
      workspaceId: snapshot.workspaceId,
      scope: snapshot.scope,
      userId: snapshot.userId,
      subscriptionId: snapshot.subscriptionId,
      evidence,
      contextArtifacts: context.artifacts,
      policy: policy?.toGenerationPolicy() ?? defaultBriefingGenerationPolicy(),
      requestedAt: snapshot.requestedAt,
    };
    const route = this.briefingModel.route(input, defaultModelPolicy, defaultModelBudget);
    const attempt = await this.briefingModel.generate(input, route);
    const validation = this.briefingModel.validateRawProviderResponse(attempt);

    if (!validation.ok) {
      return err(validation.failure);
    }

    try {
      assertBriefingCitationsAgainstEvidence(attempt.draft, evidence);
    } catch (error) {
      return err(this.briefingModel.classifyError(error));
    }
    const draft = context.unavailable ? withContextUnavailableFlag(attempt.draft) : attempt.draft;

    const artifact = BriefingArtifact.create({
      schemaVersion: 'briefing.artifact.v1',
      briefingId: this.ids.generate(),
      tenantId: snapshot.tenantId,
      workspaceId: snapshot.workspaceId,
      scope: snapshot.scope,
      userId: snapshot.userId,
      subscriptionId: snapshot.subscriptionId,
      sourceWindow: evidence.sourceWindow,
      storyClusters: evidence.clusters,
      contextArtifacts: context.artifacts,
      ...draft,
    });

    return ok({ artifact });
  }

  private async safeBuildContext(
    snapshot: ReturnType<BriefingJob['toSnapshot']>,
    evidence: BriefingEvidenceSelection,
  ): Promise<BriefingContextBuildResult> {
    try {
      const artifacts = await this.contextProvider.buildContext({
        tenantId: snapshot.tenantId,
        workspaceId: snapshot.workspaceId,
        scope: snapshot.scope,
        userId: snapshot.userId,
        subscriptionId: snapshot.subscriptionId,
        evidence,
        requestedAt: snapshot.requestedAt,
      });

      return { artifacts, unavailable: false };
    } catch {
      return { artifacts: [], unavailable: true };
    }
  }
}

const withContextUnavailableFlag = (
  draft: ProviderBriefingAttempt['draft'],
): ProviderBriefingAttempt['draft'] => ({
  ...draft,
  qualityFlags: unique([...draft.qualityFlags, 'context_unavailable']),
  readerBrief: draft.readerBrief === undefined
    ? undefined
    : {
      ...draft.readerBrief,
      qualityState: {
        ...draft.readerBrief.qualityState,
        status: draft.readerBrief.qualityState.status === 'ready'
          ? 'partial'
          : draft.readerBrief.qualityState.status,
        flags: unique([
          ...draft.readerBrief.qualityState.flags,
          'context_unavailable',
        ]),
        warnings: unique([
          ...draft.readerBrief.qualityState.warnings,
          'Additional briefing context was unavailable during generation.',
        ]),
      },
      openQuestions: unique([
        ...draft.readerBrief.openQuestions,
        'Did missing context change the interpretation of this briefing?',
      ]),
      risks: unique([
        ...draft.readerBrief.risks,
        'Additional briefing context was unavailable during generation.',
      ]),
    },
  risksAndUnknowns: [
    ...draft.risksAndUnknowns,
    {
      description: 'Additional briefing context was unavailable during generation.',
      reason: 'provider_outage',
    },
  ],
});

const unique = <T>(values: readonly T[]): readonly T[] => [...new Set(values)];
