import type { RabbitMqQueuePublisherOptions } from "@social-monitor/platform-queue/adapters/rabbitmq";

import type { OpenAiResponsesReaderSummaryModelAdapterOptions } from "../../adapters/model/openai-responses-reader-summary-model.adapter";
import type {
  AutoSummaryCandidateRepositoryPort,
  ReaderSummaryArtifactRepositoryPort,
  ReaderSummaryContextProviderPort,
  READER_SUMMARY_COVERAGE_COUNTER,
  ReaderSummaryCoverageCounterPort,
  ReaderSummaryEvidenceSelectorPort,
  ReaderSummaryGitHubProjectionReaderPort,
  ReaderSummaryJobRepositoryPort,
  ReaderSummaryJobQueuePort,
  ReaderSummaryPolicyRepositoryPort,
  ReaderSummaryPreviewMediaEnricherPort,
  ReaderSummaryPublicationPort,
  ReaderSummaryWeeklyProjectionReaderPort,
  SummaryArtifactRepositoryPort,
  SummaryEventPublisherPort,
  SummaryEvidenceSelectorPort,
  SummaryFeedbackRepositoryPort,
  SummaryJobQueuePort,
  SummaryJobRepositoryPort,
  SummaryMemoryPort,
  SummaryPolicyRepositoryPort,
  UserSummaryPreferenceReaderPort,
  YoutubeVideoSummaryProviderPort,
} from "../../ports";
import type {
  READER_SUMMARY_ARTIFACT_REPOSITORY,
  READER_SUMMARY_CONTEXT_PROVIDER,
  READER_SUMMARY_EVIDENCE_SELECTOR,
  READER_SUMMARY_GITHUB_PROJECTION_READER,
  READER_SUMMARY_JOB_QUEUE,
  READER_SUMMARY_JOB_REPOSITORY,
  READER_SUMMARY_MODEL_PROVIDER_MODE,
  READER_SUMMARY_OPENAI_RESPONSES_MODEL_OPTIONS,
  READER_SUMMARY_POLICY_REPOSITORY,
  READER_SUMMARY_PREVIEW_MEDIA_ENRICHER,
  READER_SUMMARY_PUBLICATION,
  READER_SUMMARY_WEEKLY_PROJECTION_READER,
  READER_SUMMARY_TOPIC_LABELER_MODE,
  SUMMARY_ARTIFACT_REPOSITORY,
  SUMMARY_AUTO_SUMMARY_CANDIDATE_REPOSITORY,
  SUMMARY_EVIDENCE_SELECTOR,
  SUMMARY_EVENT_PUBLISHER,
  SUMMARY_FEEDBACK_REPOSITORY,
  SUMMARY_JOB_QUEUE,
  SUMMARY_JOB_QUEUE_MODE,
  SUMMARY_JOB_REPOSITORY,
  SUMMARY_MEMORY,
  SUMMARY_MEMORY_MODE,
  SUMMARY_MODEL_PROVIDER_MODE,
  SUMMARY_PERSISTENCE_MODE,
  SUMMARY_POLICY_REPOSITORY,
  SUMMARY_PRISMA_CLIENT,
  SUMMARY_RABBITMQ_JOB_QUEUE_OPTIONS,
  SUMMARY_RABBITMQ_QUEUE_CHANNEL,
  SUMMARY_USER_SUMMARY_PREFERENCE_READER,
  SUMMARY_YOUTUBE_VIDEO_SUMMARY_PROVIDER,
  SUMMARY_YOUTUBE_VIDEO_SUMMARY_PROVIDER_MODE,
  ReaderSummaryModelProviderMode,
  ReaderSummaryTopicLabelerMode,
  SummaryJobQueueMode,
  SummaryMemoryMode,
  SummaryModelProviderMode,
  SummaryPersistenceMode,
  SummaryYoutubeVideoSummaryProviderMode,
} from "./summary-provider-tokens";

export type SummaryProviderTokenMap = {
  readonly [SUMMARY_PERSISTENCE_MODE]: SummaryPersistenceMode;
  readonly [SUMMARY_JOB_QUEUE_MODE]: SummaryJobQueueMode;
  readonly [SUMMARY_MODEL_PROVIDER_MODE]: SummaryModelProviderMode;
  readonly [READER_SUMMARY_MODEL_PROVIDER_MODE]: ReaderSummaryModelProviderMode;
  readonly [READER_SUMMARY_TOPIC_LABELER_MODE]: ReaderSummaryTopicLabelerMode;
  readonly [READER_SUMMARY_OPENAI_RESPONSES_MODEL_OPTIONS]: OpenAiResponsesReaderSummaryModelAdapterOptions;
  readonly [SUMMARY_MEMORY_MODE]: SummaryMemoryMode;
  readonly [SUMMARY_YOUTUBE_VIDEO_SUMMARY_PROVIDER_MODE]: SummaryYoutubeVideoSummaryProviderMode;
  readonly [SUMMARY_RABBITMQ_JOB_QUEUE_OPTIONS]: RabbitMqQueuePublisherOptions;
  readonly [SUMMARY_RABBITMQ_QUEUE_CHANNEL]: unknown;
  readonly [SUMMARY_PRISMA_CLIENT]: unknown;
  readonly [SUMMARY_JOB_REPOSITORY]: SummaryJobRepositoryPort;
  readonly [SUMMARY_JOB_QUEUE]: SummaryJobQueuePort;
  readonly [SUMMARY_EVIDENCE_SELECTOR]: SummaryEvidenceSelectorPort;
  readonly [SUMMARY_YOUTUBE_VIDEO_SUMMARY_PROVIDER]: YoutubeVideoSummaryProviderPort;
  readonly [SUMMARY_ARTIFACT_REPOSITORY]: SummaryArtifactRepositoryPort;
  readonly [SUMMARY_FEEDBACK_REPOSITORY]: SummaryFeedbackRepositoryPort;
  readonly [SUMMARY_POLICY_REPOSITORY]: SummaryPolicyRepositoryPort;
  readonly [SUMMARY_EVENT_PUBLISHER]: SummaryEventPublisherPort;
  readonly [SUMMARY_MEMORY]: SummaryMemoryPort;
  readonly [SUMMARY_USER_SUMMARY_PREFERENCE_READER]: UserSummaryPreferenceReaderPort;
  readonly [SUMMARY_AUTO_SUMMARY_CANDIDATE_REPOSITORY]: AutoSummaryCandidateRepositoryPort;
  readonly [READER_SUMMARY_JOB_REPOSITORY]: ReaderSummaryJobRepositoryPort;
  readonly [READER_SUMMARY_JOB_QUEUE]: ReaderSummaryJobQueuePort;
  readonly [READER_SUMMARY_EVIDENCE_SELECTOR]: ReaderSummaryEvidenceSelectorPort;
  readonly [READER_SUMMARY_ARTIFACT_REPOSITORY]: ReaderSummaryArtifactRepositoryPort;
  readonly [READER_SUMMARY_GITHUB_PROJECTION_READER]: ReaderSummaryGitHubProjectionReaderPort;
  readonly [READER_SUMMARY_WEEKLY_PROJECTION_READER]: ReaderSummaryWeeklyProjectionReaderPort;
  readonly [READER_SUMMARY_POLICY_REPOSITORY]: ReaderSummaryPolicyRepositoryPort;
  readonly [READER_SUMMARY_PUBLICATION]: ReaderSummaryPublicationPort;
  readonly [READER_SUMMARY_CONTEXT_PROVIDER]: ReaderSummaryContextProviderPort;
  readonly [READER_SUMMARY_COVERAGE_COUNTER]: ReaderSummaryCoverageCounterPort;
  readonly [READER_SUMMARY_PREVIEW_MEDIA_ENRICHER]: ReaderSummaryPreviewMediaEnricherPort;
};
