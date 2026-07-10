import type {
  ReaderSummaryTopicMap,
  ReaderSummaryTopicMapStructureQuality,
} from "../domain";

export type ReaderSummaryTopicMapPublicationRejection = {
  readonly topicMap: ReaderSummaryTopicMap;
  readonly structureQuality: ReaderSummaryTopicMapStructureQuality;
  readonly minimumGroupedCoverage: number;
};

export interface ReaderSummaryTopicMapPublicationAuditPort {
  recordRejectedCandidate(
    rejection: ReaderSummaryTopicMapPublicationRejection,
  ): Promise<void>;
}
