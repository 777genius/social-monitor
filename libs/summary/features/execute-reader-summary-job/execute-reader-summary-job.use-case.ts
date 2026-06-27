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
} from "@social-monitor/shared-kernel";

import {
  assertReaderSummaryCitationsAgainstEvidence,
  defaultReaderSummaryGenerationPolicy,
  ReaderSummaryArtifact,
  resolveEffectiveReaderSummaryPolicy,
  type ReaderSummaryContextArtifact,
  type ReaderSummaryJob,
  type ReaderSummaryReadyEvent,
  type SummaryEvidenceSelection,
} from "../../domain";
import {
  NOOP_READER_SUMMARY_CONTEXT_PROVIDER,
  type ProviderReaderSummaryAttempt,
  type ReaderSummaryArtifactRepositoryPort,
  type ReaderSummaryContextProviderPort,
  type ReaderSummaryEvidenceSelectorPort,
  type ReaderSummaryJobRepositoryPort,
  type ReaderSummaryModelBudget,
  type ReaderSummaryModelFailure,
  type ReaderSummaryModelPolicy,
  type ReaderSummaryModelPort,
  type ReaderSummaryPolicyRepositoryPort,
  type SummaryEventPublisherPort,
  NOOP_USER_SUMMARY_PREFERENCE_READER,
  type UserSummaryPreferenceReaderPort,
} from "../../ports";
import type { ExecuteReaderSummaryJobCommand } from "./execute-reader-summary-job.command";
import type { ExecuteReaderSummaryJobResult } from "./execute-reader-summary-job.result";

type ExecuteReaderSummaryJobFailure = DomainError | Error;
type ReaderSummaryModelPipelineResult = Result<
  { readonly artifact: ReaderSummaryArtifact },
  ReaderSummaryModelFailure
>;
type ReaderSummaryContextBuildResult = {
  readonly artifacts: readonly ReaderSummaryContextArtifact[];
  readonly unavailable: boolean;
};

const defaultModelPolicy: ReaderSummaryModelPolicy = {
  preferredProvider: "deterministic-local",
  maxInputTokens: 24_000,
  maxOutputTokens: 4_000,
  maxEstimatedCostUsd: 1,
};

const defaultModelBudget: ReaderSummaryModelBudget = {
  remainingTokens: 32_000,
  remainingCostUsd: 2,
};

export class ExecuteReaderSummaryJobUseCase {
  constructor(
    private readonly readerSummaryJobs: ReaderSummaryJobRepositoryPort,
    private readonly readerSummaryArtifacts: ReaderSummaryArtifactRepositoryPort,
    private readonly readerSummaryPolicies: ReaderSummaryPolicyRepositoryPort,
    private readonly evidenceSelector: ReaderSummaryEvidenceSelectorPort,
    private readonly readerSummaryModel: ReaderSummaryModelPort,
    private readonly events: SummaryEventPublisherPort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly contextProvider: ReaderSummaryContextProviderPort = NOOP_READER_SUMMARY_CONTEXT_PROVIDER,
    private readonly userSummaryPreferences: UserSummaryPreferenceReaderPort = NOOP_USER_SUMMARY_PREFERENCE_READER,
  ) {}

  async execute(
    command: ExecuteReaderSummaryJobCommand,
  ): Promise<
    Result<ExecuteReaderSummaryJobResult, ExecuteReaderSummaryJobFailure>
  > {
    if (command.readerSummaryJobId.trim().length === 0) {
      return err(
        new DomainError(
          "validation.failed",
          "Reader summary job id must be non-empty",
        ),
      );
    }

    const existingJob = await this.readerSummaryJobs.findById({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      readerSummaryJobId: command.readerSummaryJobId,
    });

    if (existingJob === null) {
      return err(
        new DomainError(
          "resource.not_found",
          "Reader summary job was not found",
        ),
      );
    }

    const snapshot = existingJob.toSnapshot();
    if (snapshot.status === "completed" || snapshot.status === "no_signal") {
      return ok({
        readerSummaryJobId: snapshot.id,
        status: snapshot.status,
        readerSummaryId: snapshot.readerSummaryId,
      });
    }

    if (snapshot.status === "running") {
      return err(
        new DomainError(
          "operation.conflict",
          "Reader summary job is already running",
        ),
      );
    }

    const startedAt = this.clock.now();
    const runningJob = await this.readerSummaryJobs.claimForExecution({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      readerSummaryJobId: command.readerSummaryJobId,
      requestedAt: startedAt,
      startedAt,
    });

    if (runningJob === null) {
      return err(
        new DomainError(
          "operation.conflict",
          "Reader summary job was claimed by another worker",
        ),
      );
    }

    try {
      const result = await this.runModelPipeline(
        runningJob,
        command.maxEvidenceItems ?? 20,
      );

      if (!result.ok) {
        const failedJob = runningJob.fail({
          failedAt: this.clock.now(),
          failureReason: result.error.message,
        });
        await this.readerSummaryJobs.save(failedJob);

        return err(
          new DomainError(
            "external.dependency_unavailable",
            result.error.message,
            {
              kind: result.error.kind,
            },
          ),
        );
      }

      await this.readerSummaryArtifacts.save(result.value.artifact);

      const artifactSnapshot = result.value.artifact.toSnapshot();
      const finalJob = artifactSnapshot.qualityFlags.includes("no_signal")
        ? runningJob.markNoSignal({
            completedAt: this.clock.now(),
            readerSummaryId: artifactSnapshot.readerSummaryId,
          })
        : runningJob.complete({
            completedAt: this.clock.now(),
            readerSummaryId: artifactSnapshot.readerSummaryId,
          });
      await this.readerSummaryJobs.save(finalJob);

      const finalSnapshot = finalJob.toSnapshot();
      await this.events.publish({
        eventId: eventId(this.ids.generate()),
        eventType: "reader_summary.ready",
        schemaVersion: 1,
        occurredAt: this.clock.now(),
        tenantId: finalSnapshot.tenantId,
        workspaceId: finalSnapshot.workspaceId,
        correlationId: correlationId(command.readerSummaryJobId),
        causationId: causationId(finalSnapshot.id),
        payload: {
          readerSummaryJobId: finalSnapshot.id,
          readerSummaryId: artifactSnapshot.readerSummaryId,
          tenantId: finalSnapshot.tenantId,
          workspaceId: finalSnapshot.workspaceId,
          scope: finalSnapshot.scope,
          userId: finalSnapshot.userId,
          subscriptionId: finalSnapshot.subscriptionId,
          status:
            finalSnapshot.status === "no_signal" ? "no_signal" : "completed",
        },
      } satisfies ReaderSummaryReadyEvent);

      return ok({
        readerSummaryJobId: finalSnapshot.id,
        status: finalSnapshot.status,
        readerSummaryId: finalSnapshot.readerSummaryId,
      });
    } catch (error) {
      const failure = this.readerSummaryModel.classifyError(error);
      const failedJob = runningJob.fail({
        failedAt: this.clock.now(),
        failureReason: failure.message,
      });
      await this.readerSummaryJobs.save(failedJob);

      return err(
        new DomainError("external.dependency_unavailable", failure.message, {
          kind: failure.kind,
        }),
      );
    }
  }

  private async runModelPipeline(
    job: ReaderSummaryJob,
    maxEvidenceItems: number,
  ): Promise<ReaderSummaryModelPipelineResult> {
    const snapshot = job.toSnapshot();
    const evidence = await this.evidenceSelector.select({
      tenantId: snapshot.tenantId,
      workspaceId: snapshot.workspaceId,
      scope: snapshot.scope,
      userId: snapshot.userId,
      subscriptionId: snapshot.subscriptionId,
      maxItems: maxEvidenceItems,
    });
    const policy = await this.readerSummaryPolicies.findByScope({
      tenantId: snapshot.tenantId,
      workspaceId: snapshot.workspaceId,
      scope: snapshot.scope,
    });
    const userPreference =
      snapshot.userId === undefined
        ? null
        : await this.userSummaryPreferences.findEffectivePreference({
            tenantId: snapshot.tenantId,
            workspaceId: snapshot.workspaceId,
            userId: snapshot.userId,
            subscriptionId: snapshot.subscriptionId,
            topicId: readerSummaryPreferenceTopicId(snapshot, evidence),
          });
    const context = await this.safeBuildContext(snapshot, evidence);
    const basePolicy =
      policy?.toGenerationPolicy() ?? defaultReaderSummaryGenerationPolicy();
    const input = {
      tenantId: snapshot.tenantId,
      workspaceId: snapshot.workspaceId,
      scope: snapshot.scope,
      userId: snapshot.userId,
      subscriptionId: snapshot.subscriptionId,
      evidence,
      contextArtifacts: context.artifacts,
      policy: resolveEffectiveReaderSummaryPolicy(basePolicy, userPreference),
      requestedAt: snapshot.requestedAt,
    };
    const route = this.readerSummaryModel.route(
      input,
      defaultModelPolicy,
      defaultModelBudget,
    );
    const attempt = await this.readerSummaryModel.generate(input, route);
    const validation =
      this.readerSummaryModel.validateRawProviderResponse(attempt);

    if (!validation.ok) {
      return err(validation.failure);
    }

    try {
      assertReaderSummaryCitationsAgainstEvidence(attempt.draft, evidence);
    } catch (error) {
      return err(this.readerSummaryModel.classifyError(error));
    }
    const draft = context.unavailable
      ? withContextUnavailableFlag(attempt.draft)
      : attempt.draft;

    const artifact = ReaderSummaryArtifact.create({
      schemaVersion: "reader_summary.artifact.v1",
      readerSummaryId: this.ids.generate(),
      tenantId: snapshot.tenantId,
      workspaceId: snapshot.workspaceId,
      scope: snapshot.scope,
      userId: snapshot.userId,
      subscriptionId: snapshot.subscriptionId,
      sourceWindow: evidence.sourceWindow,
      storyClusters: evidence.clusters,
      contextArtifacts: context.artifacts,
      personalization: evidence.personalization,
      ...draft,
    });

    return ok({ artifact });
  }

  private async safeBuildContext(
    snapshot: ReturnType<ReaderSummaryJob["toSnapshot"]>,
    evidence: SummaryEvidenceSelection,
  ): Promise<ReaderSummaryContextBuildResult> {
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
  draft: ProviderReaderSummaryAttempt["draft"],
): ProviderReaderSummaryAttempt["draft"] => ({
  ...draft,
  qualityFlags: unique([...draft.qualityFlags, "context_unavailable"]),
  content:
    draft.content === undefined
      ? undefined
      : {
          ...draft.content,
          qualityState: {
            ...draft.content.qualityState,
            status:
              draft.content.qualityState.status === "ready"
                ? "partial"
                : draft.content.qualityState.status,
            flags: unique([
              ...draft.content.qualityState.flags,
              "context_unavailable",
            ]),
            warnings: unique([
              ...draft.content.qualityState.warnings,
              "Additional reader summary context was unavailable during generation.",
            ]),
          },
          openQuestions: unique([
            ...draft.content.openQuestions,
            "Did missing context change the interpretation of this reader summary?",
          ]),
          risks: unique([
            ...draft.content.risks,
            "Additional reader summary context was unavailable during generation.",
          ]),
        },
  risksAndUnknowns: [
    ...draft.risksAndUnknowns,
    {
      description:
        "Additional reader summary context was unavailable during generation.",
      reason: "provider_outage",
    },
  ],
});

const unique = <T>(values: readonly T[]): readonly T[] => [...new Set(values)];

const readerSummaryPreferenceTopicId = (
  snapshot: ReturnType<ReaderSummaryJob["toSnapshot"]>,
  evidence: SummaryEvidenceSelection,
): string =>
  snapshot.scope.type === "topic"
    ? snapshot.scope.topicId
    : (evidence.selectedEvidence[0]?.topicId ?? "workspace");
