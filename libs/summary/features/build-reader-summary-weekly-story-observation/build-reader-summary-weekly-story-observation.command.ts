import type {
  ReaderSummaryWeeklyCanonicalStoryObservation,
  ReaderSummaryWeeklyStoryEvidenceSelector,
} from "../../domain/entities/reader-summary-weekly-story-observation";
import type { ReaderSummaryWeeklyCanonicalStoryIdentity } from "../../domain/value-objects/reader-summary-weekly-story-identity";

export type BuildReaderSummaryWeeklyStoryObservationCommand = Readonly<{
  tenantId: string;
  workspaceId: string;
  publicationId: string;
  storyIdentity: ReaderSummaryWeeklyCanonicalStoryIdentity;
  evidence: readonly ReaderSummaryWeeklyStoryEvidenceSelector[];
  existingObservations: readonly ReaderSummaryWeeklyCanonicalStoryObservation[];
}>;
