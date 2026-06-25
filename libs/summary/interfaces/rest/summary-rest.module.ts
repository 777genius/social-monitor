import { Module } from "@nestjs/common";
import { FeedRestModule } from "@social-monitor/feed/interfaces/rest/feed-rest.module";
import { IdentityRestModule } from "@social-monitor/identity/interfaces/rest/identity-rest.module";
import { RelevanceRestModule } from "@social-monitor/relevance/interfaces/rest/relevance-rest.module";
import { CryptoIdGenerator, SystemClock } from "@social-monitor/shared-kernel";
import { SubscriptionsRestModule } from "@social-monitor/subscriptions/interfaces/rest/subscriptions-rest.module";
import { UsageRestModule } from "@social-monitor/usage/interfaces/rest/usage-rest.module";

import { UsageSummaryQuotaAdapter } from "../../adapters/quota/usage-summary-quota.adapter";
import { FeedSummaryFreshnessProbe } from "../../adapters/evidence/feed-summary-freshness.probe";
import { MeteredSummaryModelAdapter } from "../../adapters/model/metered-summary-model.adapter";
import { EvaluateSummaryQualityUseCase } from "../../features/evaluate-summary-quality/evaluate-summary-quality.use-case";
import { ExecuteBriefingJobUseCase } from "../../features/execute-briefing-job/execute-briefing-job.use-case";
import { ExecuteSummaryJobUseCase } from "../../features/execute-summary-job/execute-summary-job.use-case";
import { GetBriefingJobStatusUseCase } from "../../features/get-briefing-job-status/get-briefing-job-status.use-case";
import { GetSummaryPolicyUseCase } from "../../features/get-summary-policy/get-summary-policy.use-case";
import { GetSummaryJobStatusUseCase } from "../../features/get-summary-job-status/get-summary-job-status.use-case";
import { GetSummaryUseCase } from "../../features/get-summary/get-summary.use-case";
import { ListSummaryFeedbackUseCase } from "../../features/list-summary-feedback/list-summary-feedback.use-case";
import { ListSummariesUseCase } from "../../features/list-summaries/list-summaries.use-case";
import {
  RecordSummaryFeedbackUseCase,
  type SummaryMemoryFailureMode,
} from "../../features/record-summary-feedback/record-summary-feedback.use-case";
import { RegenerateSummaryUseCase } from "../../features/regenerate-summary/regenerate-summary.use-case";
import { RequestSummaryUseCase } from "../../features/request-summary/request-summary.use-case";
import { ScheduleAutoSummariesUseCase } from "../../features/schedule-auto-summaries/schedule-auto-summaries.use-case";
import { UpsertSummaryPolicyUseCase } from "../../features/upsert-summary-policy/upsert-summary-policy.use-case";
import {
  type AutoSummaryCandidateRepositoryPort,
  type SummaryArtifactRepositoryPort,
  type SummaryEvidenceSelectorPort,
  type SummaryEventPublisherPort,
  type SummaryFeedbackRepositoryPort,
  type SummaryJobQueuePort,
  type SummaryJobRepositoryPort,
  type SummaryMemoryPort,
  type SummaryPolicyRepositoryPort,
  type UserSummaryPreferenceReaderPort,
} from "../../ports";
import { BriefingController } from "./briefing.controller";
import { BriefingJobController } from "./briefing-job.controller";
import { BriefingRequestController } from "./briefing-request.controller";
import { SummaryFeedbackController } from "./summary-feedback.controller";
import { SummaryJobController } from "./summary-job.controller";
import { SummaryPolicyController } from "./summary-policy.controller";
import { summaryBriefingProviders } from "./summary-briefing.providers";
import {
  BRIEFING_ARTIFACT_REPOSITORY,
  BRIEFING_CONTEXT_PROVIDER,
  BRIEFING_EVIDENCE_SELECTOR,
  BRIEFING_JOB_QUEUE,
  BRIEFING_JOB_REPOSITORY,
  BRIEFING_POLICY_REPOSITORY,
  SUMMARY_ARTIFACT_REPOSITORY,
  SUMMARY_AUTO_SUMMARY_CANDIDATE_REPOSITORY,
  SUMMARY_EVIDENCE_SELECTOR,
  SUMMARY_EVENT_PUBLISHER,
  SUMMARY_FEEDBACK_REPOSITORY,
  SUMMARY_JOB_QUEUE,
  SUMMARY_JOB_REPOSITORY,
  SUMMARY_MEMORY,
  SUMMARY_POLICY_REPOSITORY,
  SUMMARY_USER_SUMMARY_PREFERENCE_READER,
  briefingOpenAiResponsesModelOptionsProvider,
  briefingModelProviderModeProvider,
  summaryJobQueueModeProvider,
  summaryMemoryModeProvider,
  summaryModelProviderModeProvider,
  summaryPersistenceModeProvider,
  summaryRabbitMqJobQueueOptionsProvider,
  summaryYoutubeVideoSummaryProviderModeProvider,
} from "./summary-provider-tokens";
import {
  summaryRestInfrastructureExports,
  summaryRestInfrastructureProviders,
} from "./summary-rest-infrastructure.module";
import { SummaryRequestController } from "./summary-request.controller";
import { SummaryController } from "./summary.controller";

@Module({
  imports: [
    UsageRestModule,
    IdentityRestModule,
    FeedRestModule,
    SubscriptionsRestModule,
    RelevanceRestModule,
  ],
  controllers: [
    BriefingController,
    BriefingJobController,
    BriefingRequestController,
    SummaryController,
    SummaryFeedbackController,
    SummaryJobController,
    SummaryPolicyController,
    SummaryRequestController,
  ],
  providers: [
    summaryPersistenceModeProvider,
    summaryJobQueueModeProvider,
    summaryModelProviderModeProvider,
    briefingModelProviderModeProvider,
    briefingOpenAiResponsesModelOptionsProvider,
    summaryMemoryModeProvider,
    summaryYoutubeVideoSummaryProviderModeProvider,
    summaryRabbitMqJobQueueOptionsProvider,
    ...summaryRestInfrastructureProviders,
    ...summaryBriefingProviders,
    {
      provide: RequestSummaryUseCase,
      useFactory: (
        summaryJobs: SummaryJobRepositoryPort,
        summaryJobQueue: SummaryJobQueuePort,
        summaryQuota: UsageSummaryQuotaAdapter,
      ) =>
        new RequestSummaryUseCase(
          summaryJobs,
          summaryJobQueue,
          summaryQuota,
          new CryptoIdGenerator(),
          new SystemClock(),
        ),
      inject: [
        SUMMARY_JOB_REPOSITORY,
        SUMMARY_JOB_QUEUE,
        UsageSummaryQuotaAdapter,
      ],
    },
    {
      provide: ScheduleAutoSummariesUseCase,
      useFactory: (
        candidates: AutoSummaryCandidateRepositoryPort,
        requestSummary: RequestSummaryUseCase,
      ) => new ScheduleAutoSummariesUseCase(candidates, requestSummary),
      inject: [
        SUMMARY_AUTO_SUMMARY_CANDIDATE_REPOSITORY,
        RequestSummaryUseCase,
      ],
    },
    {
      provide: ExecuteSummaryJobUseCase,
      useFactory: (
        summaryJobs: SummaryJobRepositoryPort,
        summaryArtifacts: SummaryArtifactRepositoryPort,
        summaryPolicies: SummaryPolicyRepositoryPort,
        userSummaryPreferences: UserSummaryPreferenceReaderPort,
        evidenceSelector: SummaryEvidenceSelectorPort,
        summaryModel: MeteredSummaryModelAdapter,
        events: SummaryEventPublisherPort,
        memory: SummaryMemoryPort,
      ) =>
        new ExecuteSummaryJobUseCase(
          summaryJobs,
          summaryArtifacts,
          summaryPolicies,
          userSummaryPreferences,
          evidenceSelector,
          summaryModel,
          events,
          new CryptoIdGenerator(),
          new SystemClock(),
          memory,
        ),
      inject: [
        SUMMARY_JOB_REPOSITORY,
        SUMMARY_ARTIFACT_REPOSITORY,
        SUMMARY_POLICY_REPOSITORY,
        SUMMARY_USER_SUMMARY_PREFERENCE_READER,
        SUMMARY_EVIDENCE_SELECTOR,
        MeteredSummaryModelAdapter,
        SUMMARY_EVENT_PUBLISHER,
        SUMMARY_MEMORY,
      ],
    },
    {
      provide: EvaluateSummaryQualityUseCase,
      useFactory: (summaryModel: MeteredSummaryModelAdapter) =>
        new EvaluateSummaryQualityUseCase(summaryModel),
      inject: [MeteredSummaryModelAdapter],
    },
    {
      provide: GetSummaryPolicyUseCase,
      useFactory: (summaryPolicies: SummaryPolicyRepositoryPort) =>
        new GetSummaryPolicyUseCase(
          summaryPolicies,
          new CryptoIdGenerator(),
          new SystemClock(),
        ),
      inject: [SUMMARY_POLICY_REPOSITORY],
    },
    {
      provide: UpsertSummaryPolicyUseCase,
      useFactory: (summaryPolicies: SummaryPolicyRepositoryPort) =>
        new UpsertSummaryPolicyUseCase(
          summaryPolicies,
          new CryptoIdGenerator(),
          new SystemClock(),
        ),
      inject: [SUMMARY_POLICY_REPOSITORY],
    },
    {
      provide: GetSummaryUseCase,
      useFactory: (
        summaryArtifacts: SummaryArtifactRepositoryPort,
        freshness: FeedSummaryFreshnessProbe,
      ) => new GetSummaryUseCase(summaryArtifacts, freshness),
      inject: [SUMMARY_ARTIFACT_REPOSITORY, FeedSummaryFreshnessProbe],
    },
    {
      provide: ListSummariesUseCase,
      useFactory: (
        summaryArtifacts: SummaryArtifactRepositoryPort,
        freshness: FeedSummaryFreshnessProbe,
      ) => new ListSummariesUseCase(summaryArtifacts, freshness),
      inject: [SUMMARY_ARTIFACT_REPOSITORY, FeedSummaryFreshnessProbe],
    },
    {
      provide: GetSummaryJobStatusUseCase,
      useFactory: (summaryJobs: SummaryJobRepositoryPort) =>
        new GetSummaryJobStatusUseCase(summaryJobs),
      inject: [SUMMARY_JOB_REPOSITORY],
    },
    {
      provide: ListSummaryFeedbackUseCase,
      useFactory: (
        summaryArtifacts: SummaryArtifactRepositoryPort,
        feedback: SummaryFeedbackRepositoryPort,
      ) => new ListSummaryFeedbackUseCase(summaryArtifacts, feedback),
      inject: [SUMMARY_ARTIFACT_REPOSITORY, SUMMARY_FEEDBACK_REPOSITORY],
    },
    {
      provide: RecordSummaryFeedbackUseCase,
      useFactory: (
        summaryArtifacts: SummaryArtifactRepositoryPort,
        feedback: SummaryFeedbackRepositoryPort,
        memory: SummaryMemoryPort,
      ) =>
        new RecordSummaryFeedbackUseCase(
          summaryArtifacts,
          feedback,
          new CryptoIdGenerator(),
          new SystemClock(),
          memory,
          resolveSummaryMemoryFailureMode(process.env),
        ),
      inject: [
        SUMMARY_ARTIFACT_REPOSITORY,
        SUMMARY_FEEDBACK_REPOSITORY,
        SUMMARY_MEMORY,
      ],
    },
    {
      provide: RegenerateSummaryUseCase,
      useFactory: (
        summaryArtifacts: SummaryArtifactRepositoryPort,
        summaryJobs: SummaryJobRepositoryPort,
        summaryQuota: UsageSummaryQuotaAdapter,
      ) =>
        new RegenerateSummaryUseCase(
          summaryArtifacts,
          summaryJobs,
          summaryQuota,
          new CryptoIdGenerator(),
          new SystemClock(),
        ),
      inject: [
        SUMMARY_ARTIFACT_REPOSITORY,
        SUMMARY_JOB_REPOSITORY,
        UsageSummaryQuotaAdapter,
      ],
    },
  ],
  exports: [
    ExecuteBriefingJobUseCase,
    EvaluateSummaryQualityUseCase,
    ExecuteSummaryJobUseCase,
    GetBriefingJobStatusUseCase,
    GetSummaryJobStatusUseCase,
    ListSummaryFeedbackUseCase,
    ...summaryRestInfrastructureExports,
    BRIEFING_ARTIFACT_REPOSITORY,
    BRIEFING_CONTEXT_PROVIDER,
    BRIEFING_EVIDENCE_SELECTOR,
    BRIEFING_JOB_QUEUE,
    BRIEFING_JOB_REPOSITORY,
    BRIEFING_POLICY_REPOSITORY,
    GetSummaryPolicyUseCase,
    RecordSummaryFeedbackUseCase,
    RegenerateSummaryUseCase,
    RequestSummaryUseCase,
    ScheduleAutoSummariesUseCase,
    UpsertSummaryPolicyUseCase,
  ],
})
export class SummaryRestModule {}

const resolveSummaryMemoryFailureMode = (
  env: NodeJS.ProcessEnv,
): SummaryMemoryFailureMode => {
  const value = env.SUMMARY_MEMORY_FAILURE_MODE?.trim() ?? "best_effort";
  if (value === "best_effort" || value === "fail") {
    return value;
  }

  throw new Error(
    'SUMMARY_MEMORY_FAILURE_MODE must be "best_effort" or "fail"',
  );
};
