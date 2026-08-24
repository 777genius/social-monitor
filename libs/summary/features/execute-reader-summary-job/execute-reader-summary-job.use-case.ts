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
  admitReaderPostPromotionEvidence,
  buildReaderSummaryCoveragePlan,
  calibrateReaderSummaryConfidence,
  defaultReaderSummaryGenerationPolicy,
  ReaderSummaryArtifact,
  ReaderSummaryPublicationPolicy,
  primaryReaderSummaryEvidence,
  resolveEffectiveReaderSummaryPolicy,
  type ReaderSummaryJob,
} from "../../domain";
import {
  NOOP_READER_SUMMARY_CONTEXT_PROVIDER,
  type ReaderSummaryArtifactRepositoryPort,
  type ReaderSummaryContextProviderPort,
  type ReaderSummaryDailyCanonicalRecoveryV4ProvenancePort,
  type ReaderSummaryEvidenceSelectorPort,
  type ReaderSummaryJobRepositoryPort,
  type ReaderSummaryGitHubProjectionReaderPort,
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
import { withReaderSummaryHistoricalOmissionQuality } from "./reader-summary-historical-omission-quality";
import type { ExecuteReaderSummaryJobCommand } from "./execute-reader-summary-job.command";
import type { ExecuteReaderSummaryJobResult } from "./execute-reader-summary-job.result";
import {
  recordReaderSummaryPromotionLifecycle,
  type ReaderSummaryPromotionControl,
} from "./reader-summary-promotion-control";
import { publishReaderSummaryJob } from "./publish-reader-summary-job";
import { ReaderSummaryExecutionLeasePolicy } from "./reader-summary-execution-lease.policy";
import { buildPromotionNoSignalArtifact } from "./reader-summary-promotion-no-signal";
import {
  buildReaderSummaryDraftWithPromotionContent,
} from "./reader-summary-promotion-content";
import {
  claimReaderSummaryJobExecution,
  readerSummaryExecutionClaimLost,
  saveReaderSummaryExecutionOutcome,
} from "./reader-summary-job-execution";
import {
  defaultModelBudget,
  defaultModelPolicy,
  defaultReaderSummaryMaxEvidenceItems,
  readerSummaryPreferenceInterestId,
  type ReaderSummaryDraft,
  type ReaderSummaryModelPipelineResult,
  safeBuildReaderSummaryContext,
  withReaderSummaryTopicMap,
} from "./execute-reader-summary-job-support";

import { buildReaderSummaryPromotionArtifactFields } from
  "./reader-summary-promotion-artifact-fields";
type ExecuteReaderSummaryJobFailure = DomainError | Error;

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
    private readonly promotionControl: ReaderSummaryPromotionControl,
    private readonly contextProvider: ReaderSummaryContextProviderPort = NOOP_READER_SUMMARY_CONTEXT_PROVIDER,
    private readonly userSummaryPreferences: UserSummaryPreferenceReaderPort = NOOP_USER_SUMMARY_PREFERENCE_READER,
    private readonly topicMapBuilder: BuildReaderSummaryTopicMapUseCase = new BuildReaderSummaryTopicMapUseCase(),
    private readonly publicationPolicy: ReaderSummaryPublicationPolicy = new ReaderSummaryPublicationPolicy(),
    private readonly githubProjectionReader: ReaderSummaryGitHubProjectionReaderPort = UNAVAILABLE_READER_SUMMARY_GITHUB_PROJECTION_READER,
    private readonly historicalGitHubOmission?: ReaderSummaryHistoricalGitHubOmission,
    private readonly recoveryProvenance?: ReaderSummaryDailyCanonicalRecoveryV4ProvenancePort,
    private readonly executionLease: ReaderSummaryExecutionLeasePolicy = new ReaderSummaryExecutionLeasePolicy(),
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

    const runningJob = await claimReaderSummaryJobExecution({
      jobs: this.readerSummaryJobs,
      clock: this.clock,
      lease: this.executionLease,
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      readerSummaryJobId: command.readerSummaryJobId,
    });

    if (runningJob === null) {
      return err(
        new DomainError(
          "operation.conflict",
          "Reader summary job was claimed by another worker",
        ),
      );
    }
    const claimStartedAt = runningJob.toSnapshot().startedAt;
    if (claimStartedAt === undefined) {
      return readerSummaryExecutionClaimLost();
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
        const saved = await saveReaderSummaryExecutionOutcome(
          this.readerSummaryJobs,
          failedJob,
          claimStartedAt,
        );
        if (!saved) {
          return readerSummaryExecutionClaimLost();
        }

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
        editorialEvidence: result.value.editorialEvidence,
        publicationPolicy: this.publicationPolicy,
        githubProjectionReader: this.githubProjectionReader,
        observedThrough: this.clock.now(),
        historicalGitHubOmission: this.historicalGitHubOmission,
        recoveryProvenance: this.recoveryProvenance,
      });
      await this.readerSummaryArtifacts.save(result.value.artifact, {
        publicationDecision: prepublication.publicationDecision,
        githubProjectionAudit: prepublication.githubProjectionAudit,
      });
      if (prepublication.publicationDecision.status === "rejected") {
        recordReaderSummaryPromotionLifecycle({
          artifact: result.value.artifact,
          control: this.promotionControl,
          lifecycle: "rejected",
        });
        const artifactSnapshot = result.value.artifact.toSnapshot();
        const rejectedJob = runningJob.rejectForQuality({
          rejectedAt: this.clock.now(),
          readerSummaryId: artifactSnapshot.readerSummaryId,
          failureReason: `Reader summary artifact failed pre-publish quality gate: ${prepublication.publicationDecision.reasons.join("; ")}`,
        });
        const saved = await saveReaderSummaryExecutionOutcome(
          this.readerSummaryJobs,
          rejectedJob,
          claimStartedAt,
        );
        if (!saved) {
          return readerSummaryExecutionClaimLost();
        }

        return ok({
          readerSummaryJobId: rejectedJob.toSnapshot().id,
          status: "quality_rejected",
          readerSummaryId: artifactSnapshot.readerSummaryId,
        });
      }

      const publicationResult = await publishReaderSummaryJob({
        artifact: result.value.artifact,
        runningJob,
        publicationDecision: prepublication.publicationDecision,
        githubProjectionAudit: prepublication.githubProjectionAudit,
        jobs: this.readerSummaryJobs,
        publications: this.publications,
        ids: this.ids,
        clock: this.clock,
      });
      if (publicationResult.ok) {
        recordReaderSummaryPromotionLifecycle({
          artifact: result.value.artifact,
          control: this.promotionControl,
          lifecycle: "delivered",
        });
      }
      return publicationResult;
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
      const saved = await saveReaderSummaryExecutionOutcome(
        this.readerSummaryJobs,
        failedJob,
        claimStartedAt,
      );
      if (!saved) {
        return readerSummaryExecutionClaimLost();
      }

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
    const selectedEvidence = await this.evidenceSelector.select({
      tenantId: snapshot.tenantId,
      workspaceId: snapshot.workspaceId,
      scope: snapshot.scope,
      period: snapshot.period,
      userId: snapshot.userId,
      subscriptionId: snapshot.subscriptionId,
      maxItems: maxEvidenceItems,
      observedThrough: generatedAt,
    });
    const readerSummaryId = this.ids.generate();
    const admittedSelection = admitReaderPostPromotionEvidence(selectedEvidence);
    const {
      promotionCounts,
      ...modelEvidence
    } = admittedSelection;
    const rawPrimaryEvidence = primaryReaderSummaryEvidence(selectedEvidence);
    const admittedPrimaryEvidence = primaryReaderSummaryEvidence(modelEvidence);
    this.promotionControl.metrics.record({
      candidateCount: rawPrimaryEvidence.selectedEvidence.length,
      topCount: promotionCounts.top,
      additionalCount: promotionCounts.additional,
      admittedEvidenceCount: admittedPrimaryEvidence.selectedEvidence.length,
      omittedEvidenceCount: Math.max(
        0,
        rawPrimaryEvidence.selectedEvidence.length -
          admittedPrimaryEvidence.selectedEvidence.length,
      ),
      lifecycle: "evaluated",
    });
    // Publication is an independent oracle boundary. It must retain the raw,
    // typed selector result so a production admission false negative cannot
    // erase an expected boundary candidate before verification.
    const publicationEvidence = selectedEvidence;
    const primaryEvidence = primaryReaderSummaryEvidence(modelEvidence);
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
    const context = await safeBuildReaderSummaryContext({
      contextProvider: this.contextProvider,
      snapshot,
      evidence: primaryEvidence,
    });
    if (primaryEvidence.selectedEvidence.length === 0) {
      return ok({
        evidence: publicationEvidence,
        editorialEvidence: modelEvidence,
        artifact: buildPromotionNoSignalArtifact({
          snapshot,
          readerSummaryId,
          generatedAt,
          evidence: modelEvidence,
          promotionAttestations: [],
          contextArtifacts: context.artifacts,
        }),
      });
    }
    const basePolicy =
      policy?.toGenerationPolicy() ?? defaultReaderSummaryGenerationPolicy();
    const input = {
      tenantId: snapshot.tenantId,
      workspaceId: snapshot.workspaceId,
      scope: snapshot.scope,
      period: snapshot.period,
      userId: snapshot.userId,
      subscriptionId: snapshot.subscriptionId,
      evidence: modelEvidence,
      coveragePlan: buildReaderSummaryCoveragePlan(primaryEvidence),
      contextArtifacts: [],
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
      assertReaderSummaryCitationsAgainstEvidence(attempt.draft, modelEvidence);
    } catch (error) {
      return err(this.readerSummaryModel.classifyError(error));
    }
    const draftWithContext = context.unavailable
      ? withReaderSummaryContextUnavailable(attempt.draft)
      : attempt.draft;
    const qualityDraft = withReaderSummaryHistoricalOmissionQuality(
      draftWithContext,
      this.historicalGitHubOmission,
    );
    const draftWithContent = buildReaderSummaryDraftWithPromotionContent(
      modelEvidence,
      qualityDraft,
    );
    const calibratedDraft = {
      ...draftWithContent,
      confidence: calibrateReaderSummaryConfidence({
        confidence: draftWithContent.confidence,
        topReads: draftWithContent.content.topReads,
      }),
    };
    const createArtifact = (
      draft: ReaderSummaryDraft,
    ): ReaderSummaryArtifact => ReaderSummaryArtifact.create({
      schemaVersion: "reader_summary.artifact.v1",
      readerSummaryId,
      tenantId: snapshot.tenantId,
      workspaceId: snapshot.workspaceId,
      scope: snapshot.scope,
      period: snapshot.period,
      userId: snapshot.userId,
      subscriptionId: snapshot.subscriptionId,
      generatedAt,
      sourceWindow: modelEvidence.sourceWindow,
      storyClusters: modelEvidence.clusters,
      contextArtifacts: context.artifacts,
      personalization: modelEvidence.personalization,
      ...draft,
      ...buildReaderSummaryPromotionArtifactFields({
        artifactId: readerSummaryId,
        modelEvidence,
        draft,
      }),
    });
    const preflightArtifact = createArtifact(calibratedDraft);
    if (
      this.publicationPolicy.evaluate({
        artifact: preflightArtifact,
        evidence: publicationEvidence,
        editorialEvidence: modelEvidence,
      }).status === "rejected"
    ) {
      return ok({
        artifact: preflightArtifact,
        evidence: publicationEvidence,
        editorialEvidence: modelEvidence,
      });
    }
    const draftResult = await withReaderSummaryTopicMap({
      topicMapBuilder: this.topicMapBuilder,
      snapshot,
      evidence: modelEvidence,
      draft: calibratedDraft,
    });
    if (!draftResult.ok) {
      return err(this.readerSummaryModel.classifyError(draftResult.error));
    }
    const artifact = createArtifact(draftResult.value);

    return ok({
      artifact,
      evidence: publicationEvidence,
      editorialEvidence: modelEvidence,
    });
  }

}
