import type { Provider } from "@nestjs/common";
import { CircuitBreakerSourceFetcherAdapter } from "@social-monitor/ingestion/adapters/source/circuit-breaker-source-fetcher.adapter";
import { ExecuteScanUseCase } from "@social-monitor/ingestion/features/execute-scan/execute-scan.use-case";
import type {
  ConversationProjectionPort,
  FeedProjectionPort,
  ScanAttemptRepositoryPort,
  ScanCursorRepositoryPort,
  ScanExecutionReporterPort,
  ScanFailureQueuePort,
  ScanLeasePort,
  SourceCandidateMemoryPort,
  SourceEngagementProjectionPort,
  SourceItemEnrichmentPort,
  SourceItemMetadataProjectionPort,
  SourceItemRepositoryPort,
} from "@social-monitor/ingestion/ports";
import { CryptoIdGenerator, SystemClock } from "@social-monitor/shared-kernel";

import { ArticleContentSourceItemEnrichmentAdapter } from "./article-content-enrichment.module";
import {
  INGESTION_CONVERSATION_PROJECTION,
  INGESTION_FEED_PROJECTION,
  INGESTION_SCAN_ATTEMPT_REPOSITORY,
  INGESTION_SCAN_CURSOR_REPOSITORY,
  INGESTION_SCAN_EXECUTION_REPORTER,
  INGESTION_SCAN_FAILURE_QUEUE,
  INGESTION_SCAN_LEASE,
  INGESTION_SOURCE_CANDIDATE_MEMORY,
  INGESTION_SOURCE_ENGAGEMENT_PROJECTION,
  INGESTION_SOURCE_ITEM_METADATA_PROJECTION,
  INGESTION_SOURCE_ITEM_REPOSITORY,
} from "./ingestion-worker-provider-tokens";

export const executeScanProviders: Provider[] = [
  {
    provide: ExecuteScanUseCase,
    useFactory: (
      sourceFetcher: CircuitBreakerSourceFetcherAdapter,
      sourceItems: SourceItemRepositoryPort,
      feedProjection: FeedProjectionPort,
      scanAttempts: ScanAttemptRepositoryPort,
      scanCursors: ScanCursorRepositoryPort,
      scanExecutionReporter: ScanExecutionReporterPort,
      scanFailures: ScanFailureQueuePort,
      scanLeases: ScanLeasePort,
      sourceItemMetadataProjection: SourceItemMetadataProjectionPort,
      sourceItemEnrichment: SourceItemEnrichmentPort,
      conversationProjection: ConversationProjectionPort,
      candidateMemory: SourceCandidateMemoryPort,
      sourceEngagementProjection: SourceEngagementProjectionPort,
    ) =>
      new ExecuteScanUseCase(
        sourceFetcher,
        sourceItems,
        feedProjection,
        scanAttempts,
        scanCursors,
        scanExecutionReporter,
        scanFailures,
        scanLeases,
        new CryptoIdGenerator(),
        new SystemClock(),
        sourceItemMetadataProjection,
        sourceItemEnrichment,
        conversationProjection,
        candidateMemory,
        sourceEngagementProjection,
      ),
    inject: [
      CircuitBreakerSourceFetcherAdapter,
      INGESTION_SOURCE_ITEM_REPOSITORY,
      INGESTION_FEED_PROJECTION,
      INGESTION_SCAN_ATTEMPT_REPOSITORY,
      INGESTION_SCAN_CURSOR_REPOSITORY,
      INGESTION_SCAN_EXECUTION_REPORTER,
      INGESTION_SCAN_FAILURE_QUEUE,
      INGESTION_SCAN_LEASE,
      INGESTION_SOURCE_ITEM_METADATA_PROJECTION,
      ArticleContentSourceItemEnrichmentAdapter,
      INGESTION_CONVERSATION_PROJECTION,
      INGESTION_SOURCE_CANDIDATE_MEMORY,
      INGESTION_SOURCE_ENGAGEMENT_PROJECTION,
    ],
  },
];
