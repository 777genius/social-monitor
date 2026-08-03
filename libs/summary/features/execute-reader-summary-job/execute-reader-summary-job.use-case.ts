import {
  type Clock,
  DomainError,
  type IdGenerator,
  err,
  ok,
  type Result,
} from "@social-monitor/shared-kernel";

import {
  assertReaderSummaryCitationsAgainstEvidence,
  buildReaderSummaryCoveragePlan,
  buildReaderSummary,
  calibrateReaderSummaryConfidence,
  defaultReaderSummaryGenerationPolicy,
  ReaderSummaryArtifact,
  ReaderSummaryPublicationPolicy,
  primaryReaderSummaryEvidence,
  resolveEffectiveReaderSummaryPolicy,
  type ReaderSummaryContextArtifact,
  type ReaderSummaryJob,
  type SummaryEvidenceSelection,
} from "../../domain";
import {
  NOOP_READER_SUMMARY_CONTEXT_PROVIDER,
  type ProviderReaderSummaryAttempt,
  type ReaderSummaryArtifactRepositoryPort,
  type ReaderSummaryContextProviderPort,
  type ReaderSummaryEvidenceSelectorPort,
  type ReaderSummaryJobRepositoryPort,
  type ReaderSummaryGitHubProjectionReaderPort,
  type ReaderSummaryModelBudget,
  type ReaderSummaryModelFailure,
  type ReaderSummaryModelPolicy,
  type ReaderSummaryModelPort,
  type ReaderSummaryPolicyRepositoryPort,
  type ReaderSummaryPublicationPort,
  NOOP_USER_SUMMARY_PREFERENCE_READER,
  type UserSummaryPreferenceReaderPort,
  UNAVAILABLE_READER_SUMMARY_GITHUB_PROJECTION_READER,
} from "../../ports";
import { BuildReaderSummaryTopicMapUseCase } from "../build-reader-summary-topic-map/build-reader-summary-topic-map.use-case";
import { withReaderSummaryContextUnavailable } from "./reader-summary-context-unavailable";
import { evaluateReaderSummaryPrepublication } from "./reader-summary-prepublication-gate";
import type { ReaderSummaryHistoricalGitHubOmission } from "./reader-summary-prepublication-gate";
import type { ExecuteReaderSummaryJobCommand } from "./execute-reader-summary-job.command";
import type { ExecuteReaderSummaryJobResult } from "./execute-reader-summary-job.result";
import { publishReaderSummaryJob } from "./publish-reader-summary-job";

type ExecuteReaderSummaryJobFailure = DomainError | Error;
type ReaderSummaryModelPipelineResult = Result<
  {
    readonly artifact: ReaderSummaryArtifact;
    readonly evidence: SummaryEvidenceSelection;
  },
  ReaderSummaryModelFailure
>;
type ReaderSummaryDraft = ProviderReaderSummaryAttempt["draft"];
type ReaderSummaryDraftWithContent = Omit<ReaderSummaryDraft, "content"> & {
  readonly content: NonNullable<ReaderSummaryDraft["content"]>;
};
type ReaderSummaryContextBuildResult = {
  readonly artifacts: readonly ReaderSummaryContextArtifact[];
  readonly unavailable: boolean;
};

const defaultModelPolicy: ReaderSummaryModelPolicy = {
  preferredProvider: "deterministic-local",
  maxInputTokens: 96_000,
  maxOutputTokens: 16_000,
  maxEstimatedCostUsd: 1,
};

const defaultModelBudget: ReaderSummaryModelBudget = {
  remainingTokens: 160_000,
  remainingCostUsd: 2,
};

const defaultReaderSummaryMaxEvidenceItems = 120;

export class ExecuteReaderSummaryJobUseCase {
  constructor(
    private readonly readerSummaryJobs: ReaderSummaryJobRepositoryPort,
    private readonly readerSummaryArtifacts: ReaderSummaryArtifactRepositoryPort,
    private readonly readerSummaryPolicies: ReaderSummaryPolicyRepositoryPort,
    private readonly evidenceSelector: ReaderSummaryEvidenceSelectorPort,
    private readonly readerSummaryModel: ReaderSummaryModelPort,
    private readonly publications: ReaderSummaryPublicationPort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly contextProvider: ReaderSummaryContextProviderPort = NOOP_READER_SUMMARY_CONTEXT_PROVIDER,
    private readonly userSummaryPreferences: UserSummaryPreferenceReaderPort = NOOP_USER_SUMMARY_PREFERENCE_READER,
    private readonly topicMapBuilder: BuildReaderSummaryTopicMapUseCase = new BuildReaderSummaryTopicMapUseCase(),
    private readonly publicationPolicy: ReaderSummaryPublicationPolicy = new ReaderSummaryPublicationPolicy(),
    private readonly githubProjectionReader: ReaderSummaryGitHubProjectionReaderPort = UNAVAILABLE_READER_SUMMARY_GITHUB_PROJECTION_READER,
    private readonly historicalGitHubOmission?: ReaderSummaryHistoricalGitHubOmission,
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
        command.maxEvidenceItems ?? defaultReaderSummaryMaxEvidenceItems,
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

      const prepublication = await evaluateReaderSummaryPrepublication({
        artifact: result.value.artifact,
        evidence: result.value.evidence,
        publicationPolicy: this.publicationPolicy,
        githubProjectionReader: this.githubProjectionReader,
        observedThrough: this.clock.now(),
        historicalGitHubOmission: this.historicalGitHubOmission,
      });
      await this.readerSummaryArtifacts.save(result.value.artifact, {
        publicationDecision: prepublication.publicationDecision,
        githubProjectionAudit: prepublication.githubProjectionAudit,
      });
      if (prepublication.publicationDecision.status === "rejected") {
        const artifactSnapshot = result.value.artifact.toSnapshot();
        const rejectedJob = runningJob.rejectForQuality({
          rejectedAt: this.clock.now(),
          readerSummaryId: artifactSnapshot.readerSummaryId,
          failureReason: `Reader summary artifact failed pre-publish quality gate: ${prepublication.publicationDecision.reasons.join("; ")}`,
        });
        await this.readerSummaryJobs.save(rejectedJob);

        return ok({
          readerSummaryJobId: rejectedJob.toSnapshot().id,
          status: "quality_rejected",
          readerSummaryId: artifactSnapshot.readerSummaryId,
        });
      }

      return await publishReaderSummaryJob({
        artifact: result.value.artifact,
        runningJob,
        publicationDecision: prepublication.publicationDecision,
        githubProjectionAudit: prepublication.githubProjectionAudit,
        jobs: this.readerSummaryJobs,
        publications: this.publications,
        ids: this.ids,
        clock: this.clock,
      });
    } catch (error) {
      const failure = this.readerSummaryModel.classifyError(error);
      const durableJob = await this.readerSummaryJobs.findById({
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        readerSummaryJobId: command.readerSummaryJobId,
      });
      const durableSnapshot = durableJob?.toSnapshot();
      if (
        durableSnapshot?.status === "completed" ||
        durableSnapshot?.status === "no_signal"
      ) {
        return ok({
          readerSummaryJobId: durableSnapshot.id,
          status: durableSnapshot.status,
          readerSummaryId: durableSnapshot.readerSummaryId,
        });
      }
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
    const generatedAt = this.clock.now();
    const evidence = await this.evidenceSelector.select({
      tenantId: snapshot.tenantId,
      workspaceId: snapshot.workspaceId,
      scope: snapshot.scope,
      period: snapshot.period,
      userId: snapshot.userId,
      subscriptionId: snapshot.subscriptionId,
      maxItems: maxEvidenceItems,
      observedThrough: generatedAt,
    });
    const primaryEvidence = primaryReaderSummaryEvidence(evidence);
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
            interestId: readerSummaryPreferenceInterestId(snapshot),
          });
    const context = await this.safeBuildContext(snapshot, primaryEvidence);
    const basePolicy =
      policy?.toGenerationPolicy() ?? defaultReaderSummaryGenerationPolicy();
    const input = {
      tenantId: snapshot.tenantId,
      workspaceId: snapshot.workspaceId,
      scope: snapshot.scope,
      period: snapshot.period,
      userId: snapshot.userId,
      subscriptionId: snapshot.subscriptionId,
      evidence,
      coveragePlan: buildReaderSummaryCoveragePlan(primaryEvidence),
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
    const draftWithContext = context.unavailable
      ? withReaderSummaryContextUnavailable(attempt.draft)
      : attempt.draft;
    const draftWithContent = this.withReaderContent(
      evidence,
      draftWithContext,
    );
    const calibratedDraft = {
      ...draftWithContent,
      confidence: calibrateReaderSummaryConfidence({
        confidence: draftWithContent.confidence,
        topReads: draftWithContent.content.topReads,
      }),
    };
    const readerSummaryId = this.ids.generate();
    const createArtifact = (draft: ReaderSummaryDraft): ReaderSummaryArtifact =>
      ReaderSummaryArtifact.create({
        schemaVersion: "reader_summary.artifact.v1",
        readerSummaryId,
        tenantId: snapshot.tenantId,
        workspaceId: snapshot.workspaceId,
        scope: snapshot.scope,
        period: snapshot.period,
        userId: snapshot.userId,
        subscriptionId: snapshot.subscriptionId,
        generatedAt,
        sourceWindow: evidence.sourceWindow,
        storyClusters: evidence.clusters,
        contextArtifacts: context.artifacts,
        personalization: evidence.personalization,
        ...draft,
      });
    const preflightArtifact = createArtifact(calibratedDraft);
    if (
      this.publicationPolicy.evaluate({
        artifact: preflightArtifact,
        evidence,
      }).status === "rejected"
    ) {
      return ok({ artifact: preflightArtifact, evidence });
    }
    const draftResult = await this.withTopicMap(
      snapshot,
      evidence,
      calibratedDraft,
    );
    if (!draftResult.ok) {
      return err(this.readerSummaryModel.classifyError(draftResult.error));
    }
    const artifact = createArtifact(draftResult.value);

    return ok({ artifact, evidence });
  }

  private async withTopicMap(
    snapshot: ReturnType<ReaderSummaryJob["toSnapshot"]>,
    evidence: SummaryEvidenceSelection,
    draft: ReaderSummaryDraftWithContent,
  ): Promise<Result<ReaderSummaryDraftWithContent, DomainError>> {
    const primaryEvidence = primaryReaderSummaryEvidence(evidence);
    const topicMapResult = await this.topicMapBuilder.execute({
      tenantId: snapshot.tenantId,
      workspaceId: snapshot.workspaceId,
      scope: snapshot.scope,
      period: snapshot.period,
      requestedAt: snapshot.requestedAt,
      clusters: primaryEvidence.clusters,
      selectedEvidence: primaryEvidence.selectedEvidence,
      topStories: draft.topStories,
      citationMap: draft.citationMap,
    });
    if (!topicMapResult.ok) {
      return err(topicMapResult.error);
    }
    return ok({
      ...draft,
      content: {
        ...draft.content,
        topicMap: topicMapResult.value,
      },
    });
  }

  private withReaderContent(
    evidence: SummaryEvidenceSelection,
    draft: ReaderSummaryDraft,
  ): ReaderSummaryDraftWithContent {
    const content = buildReaderSummary({
      headline: draft.headline,
      executiveSummary: draft.executiveSummary,
      narrativeSections: draft.content?.narrativeSections,
      topStories: draft.topStories,
      interestHighlights: draft.interestHighlights,
      repeatedSignals: draft.repeatedSignals,
      risksAndUnknowns: draft.risksAndUnknowns,
      citationMap: draft.citationMap,
      storyClusters: evidence.clusters,
      sourceWindow: evidence.sourceWindow,
      selectedEvidence: evidence.selectedEvidence,
      qualityFlags: draft.qualityFlags,
      noSignalReason: draft.noSignalReason,
    });

    return {
      ...draft,
      content,
    };
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
        period: snapshot.period,
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

const readerSummaryPreferenceInterestId = (
  snapshot: ReturnType<ReaderSummaryJob["toSnapshot"]>,
): string =>
  snapshot.scope.type === "interest"
    ? snapshot.scope.interestId
    : "00000000-0000-7000-8000-000000000903";
