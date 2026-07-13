import type {
  ReaderSummaryTopicMap,
  ReaderSummaryTopicMapStructureQuality,
} from "../domain";

export type ReaderSummaryTopicMapPublicationRejection = {
  readonly topicMap: ReaderSummaryTopicMap;
  readonly structureQuality: ReaderSummaryTopicMapStructureQuality;
  readonly minimumGroupedCoverage: number;
  readonly attemptNumber: number;
  readonly totalAttempts: number;
  readonly willRetry: boolean;
  readonly retryReason: string | null;
};

export interface ReaderSummaryTopicMapPublicationAuditPort {
  recordRejectedCandidate(
    rejection: ReaderSummaryTopicMapPublicationRejection,
  ): Promise<void>;
}
