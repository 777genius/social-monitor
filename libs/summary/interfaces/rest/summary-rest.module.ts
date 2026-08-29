import { Module } from "@nestjs/common";
import { FeedRestModule } from "@social-monitor/feed/interfaces/rest/feed-rest.module";
import { IdentityRestModule } from "@social-monitor/identity/interfaces/rest/identity-rest.module";
import { ApplyAcceptedTopicRecommendationUseCase } from "@social-monitor/monitoring/features/apply-accepted-topic-recommendation/apply-accepted-topic-recommendation.use-case";
import { MonitoringRestModule } from "@social-monitor/monitoring/interfaces/rest/monitoring-rest.module";
import { RelevanceRestModule } from "@social-monitor/relevance/interfaces/rest/relevance-rest.module";
import { CryptoIdGenerator, SystemClock } from "@social-monitor/shared-kernel";
import { SubscriptionsRestModule } from "@social-monitor/subscriptions/interfaces/rest/subscriptions-rest.module";
import { UsageRestModule } from "@social-monitor/usage/interfaces/rest/usage-rest.module";

import { MonitoringReaderSummaryAcceptedTopicApplier } from "../../adapters/monitoring/monitoring-reader-summary-accepted-topic-applier";
import { UsageSummaryQuotaAdapter } from "../../adapters/quota/usage-summary-quota.adapter";
import { FeedSummaryFreshnessProbe } from "../../adapters/evidence/feed-summary-freshness.probe";
import { MeteredSummaryModelAdapter } from "../../adapters/model/metered-summary-model.adapter";
import { EvaluateSummaryQualityUseCase } from "../../features/evaluate-summary-quality/evaluate-summary-quality.use-case";
import { DecideReaderSummaryTopicRecommendationUseCase } from "../../features/decide-reader-summary-topic-recommendation/decide-reader-summary-topic-recommendation.use-case";
import { ExecuteReaderSummaryJobUseCase } from "../../features/execute-reader-summary-job/execute-reader-summary-job.use-case";
import { ExecuteSummaryJobUseCase } from "../../features/execute-summary-job/execute-summary-job.use-case";
import { GetReaderSummaryJobStatusUseCase } from "../../features/get-reader-summary-job-status/get-reader-summary-job-status.use-case";
import { GetSummaryPolicyUseCase } from "../../features/get-summary-policy/get-summary-policy.use-case";
import { GetSummaryJobStatusUseCase } from "../../features/get-summary-job-status/get-summary-job-status.use-case";
import { GetSummaryUseCase } from "../../features/get-summary/get-summary.use-case";
import { ListReaderSummariesUseCase } from "../../features/list-reader-summaries/list-reader-summaries.use-case";
import { ListReaderSummaryPeriodsUseCase } from "../../features/list-reader-summary-periods/list-reader-summary-periods.use-case";
import { ListReaderSummaryTopicRecommendationsUseCase } from "../../features/list-reader-summary-topic-recommendations/list-reader-summary-topic-recommendations.use-case";
import { ListSummaryFeedbackUseCase } from "../../features/list-summary-feedback/list-summary-feedback.use-case";
import { ListSummariesUseCase } from "../../features/list-summaries/list-summaries.use-case";
import {
  RecordSummaryFeedbackUseCase,
  type SummaryMemoryFailureMode,
} from "../../features/record-summary-feedback/record-summary-feedback.use-case";
import { RegenerateSummaryUseCase } from "../../features/regenerate-summary/regenerate-summary.use-case";
import { RequestReaderSummaryUseCase } from "../../features/request-reader-summary/request-reader-summary.use-case";
import { RequestSummaryUseCase } from "../../features/request-summary/request-summary.use-case";
import { ScheduleAutoSummariesUseCase } from "../../features/schedule-auto-summaries/schedule-auto-summaries.use-case";
import { SchedulePeriodicReaderSummariesUseCase } from "../../features/schedule-periodic-reader-summaries/schedule-periodic-reader-summaries.use-case";
import { UpsertSummaryPolicyUseCase } from "../../features/upsert-summary-policy/upsert-summary-policy.use-case";
import {
  type AutoSummaryCandidateRepositoryPort,
  type ReaderSummaryArtifactRepositoryPort,
  READER_SUMMARY_ACCEPTED_TOPIC_APPLIER,
  type ReaderSummaryAcceptedTopicApplierPort,
  type ReaderSummaryPolicyRepositoryPort,
  READER_SUMMARY_TOPIC_COLLECTION_METRICS_READER,
  READER_SUMMARY_TOPIC_RECOMMENDATION_DECISION_REPOSITORY,
  type ReaderSummaryTopicCollectionMetricsReaderPort,
  type ReaderSummaryTopicRecommendationDecisionRepositoryPort,
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
import { ReaderSummaryController } from "./reader-summary.controller";
import { ReaderSummaryJobController } from "./reader-summary-job.controller";
import { ReaderSummaryRequestController } from "./reader-summary-request.controller";
import { ReaderSummaryTopicRecommendationController } from "./reader-summary-topic-recommendation.controller";
import { ReaderSummaryWeeklyProjectionController } from "./reader-summary-weekly-projection.controller";
import { SummaryFeedbackController } from "./summary-feedback.controller";
import { SummaryJobController } from "./summary-job.controller";
import { SummaryPolicyController } from "./summary-policy.controller";
import { summaryReaderSummaryProviders } from "./summary-reader-summary.providers";
import {
  READER_SUMMARY_ARTIFACT_REPOSITORY,
  READER_SUMMARY_CONTEXT_PROVIDER,
  READER_SUMMARY_EVIDENCE_SELECTOR,
  READER_SUMMARY_JOB_QUEUE,
  READER_SUMMARY_JOB_REPOSITORY,
  READER_SUMMARY_POLICY_REPOSITORY,
  readerSummaryTopicLabelerModeProvider,
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
  readerSummaryOpenAiResponsesModelOptionsProvider,
  readerSummaryModelProviderModeProvider,
  summaryJobQueueModeProvider,
  summaryMemoryModeProvider,
  summaryModelProviderModeProvider,
  summaryPersistenceModeProvider,
  summaryRabbitMqJobQueueOptionsProvider,
  summaryYoutubeVideoSummaryProviderModeProvider,
} from "./summary-provider-tokens";
import {
  summaryAgentRuntimeClientOptionsProvider,
  summaryAgentRuntimeReaderSummaryModelOptionsProvider,
  summaryAgentRuntimeReaderSummaryStoryRelationVerifierOptionsProvider,
  summaryAgentRuntimeReaderSummaryTopicLabelerOptionsProvider,
  summaryAgentRuntimeReaderSummaryTopicRelationVerifierOptionsProvider,
  summaryAgentRuntimeSummaryModelOptionsProvider,
} from "./summary-agent-runtime-provider-tokens";
import { summaryAgentRuntimeProviders } from "./summary-agent-runtime.providers";
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
    MonitoringRestModule,
    SubscriptionsRestModule,
    RelevanceRestModule,
  ],
  controllers: [
    ReaderSummaryWeeklyProjectionController,
    ReaderSummaryController,
    ReaderSummaryJobController,
    ReaderSummaryRequestController,
    ReaderSummaryTopicRecommendationController,
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
    readerSummaryModelProviderModeProvider,
    readerSummaryTopicLabelerModeProvider,
    readerSummaryOpenAiResponsesModelOptionsProvider,
    summaryAgentRuntimeClientOptionsProvider,
    summaryAgentRuntimeSummaryModelOptionsProvider,
    summaryAgentRuntimeReaderSummaryModelOptionsProvider,
    summaryAgentRuntimeReaderSummaryStoryRelationVerifierOptionsProvider,
    summaryAgentRuntimeReaderSummaryTopicLabelerOptionsProvider,
    summaryAgentRuntimeReaderSummaryTopicRelationVerifierOptionsProvider,
    summaryMemoryModeProvider,
    summaryYoutubeVideoSummaryProviderModeProvider,
    summaryRabbitMqJobQueueOptionsProvider,
    ...summaryAgentRuntimeProviders,
    ...summaryRestInfrastructureProviders,
    ...summaryReaderSummaryProviders,
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
      provide: SchedulePeriodicReaderSummariesUseCase,
      useFactory: (
        readerSummaryPolicies: ReaderSummaryPolicyRepositoryPort,
        requestReaderSummary: RequestReaderSummaryUseCase,
      ) =>
        new SchedulePeriodicReaderSummariesUseCase(
          readerSummaryPolicies,
          requestReaderSummary,
        ),
      inject: [READER_SUMMARY_POLICY_REPOSITORY, RequestReaderSummaryUseCase],
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
      provide: ListReaderSummaryTopicRecommendationsUseCase,
      useFactory: (
        readerSummaries: ReaderSummaryArtifactRepositoryPort,
        topicCollectionMetrics: ReaderSummaryTopicCollectionMetricsReaderPort,
        topicRecommendationDecisions: ReaderSummaryTopicRecommendationDecisionRepositoryPort,
      ) =>
        new ListReaderSummaryTopicRecommendationsUseCase(
          readerSummaries,
          new SystemClock(),
          topicCollectionMetrics,
          topicRecommendationDecisions,
        ),
      inject: [
        READER_SUMMARY_ARTIFACT_REPOSITORY,
        READER_SUMMARY_TOPIC_COLLECTION_METRICS_READER,
        READER_SUMMARY_TOPIC_RECOMMENDATION_DECISION_REPOSITORY,
      ],
    },
    {
      provide: DecideReaderSummaryTopicRecommendationUseCase,
      useFactory: (
        topicRecommendationDecisions: ReaderSummaryTopicRecommendationDecisionRepositoryPort,
        acceptedTopicApplier: ReaderSummaryAcceptedTopicApplierPort,
        events: SummaryEventPublisherPort,
      ) =>
        new DecideReaderSummaryTopicRecommendationUseCase(
          topicRecommendationDecisions,
          new SystemClock(),
          acceptedTopicApplier,
          events,
          new CryptoIdGenerator(),
        ),
      inject: [
        READER_SUMMARY_TOPIC_RECOMMENDATION_DECISION_REPOSITORY,
        READER_SUMMARY_ACCEPTED_TOPIC_APPLIER,
        SUMMARY_EVENT_PUBLISHER,
      ],
    },
    {
      provide: READER_SUMMARY_ACCEPTED_TOPIC_APPLIER,
      useFactory: (
        applyAcceptedTopicRecommendation: ApplyAcceptedTopicRecommendationUseCase,
      ): ReaderSummaryAcceptedTopicApplierPort =>
        new MonitoringReaderSummaryAcceptedTopicApplier(
          applyAcceptedTopicRecommendation,
        ),
      inject: [ApplyAcceptedTopicRecommendationUseCase],
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
    ExecuteReaderSummaryJobUseCase,
    EvaluateSummaryQualityUseCase,
    ExecuteSummaryJobUseCase,
    GetReaderSummaryJobStatusUseCase,
    GetSummaryJobStatusUseCase,
    DecideReaderSummaryTopicRecommendationUseCase,
    ListReaderSummaryTopicRecommendationsUseCase,
    ListReaderSummariesUseCase,
    ListReaderSummaryPeriodsUseCase,
    ListSummaryFeedbackUseCase,
    ...summaryRestInfrastructureExports,
    READER_SUMMARY_ARTIFACT_REPOSITORY,
    READER_SUMMARY_CONTEXT_PROVIDER,
    READER_SUMMARY_EVIDENCE_SELECTOR,
    READER_SUMMARY_JOB_QUEUE,
    READER_SUMMARY_JOB_REPOSITORY,
    READER_SUMMARY_POLICY_REPOSITORY,
    GetSummaryPolicyUseCase,
    RecordSummaryFeedbackUseCase,
    RegenerateSummaryUseCase,
    RequestSummaryUseCase,
    ScheduleAutoSummariesUseCase,
    SchedulePeriodicReaderSummariesUseCase,
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
