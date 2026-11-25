import type { ReaderSummaryWeeklyProjection } from "../../features/get-reader-summary-weekly-projection/get-reader-summary-weekly-projection.use-case";
import type {
  ReaderSummaryWeeklyProjectionArtifactDto,
  ReaderSummaryWeeklyProjectionResponseDto,
} from "./reader-summary-weekly-projection.dto";

export const readerSummaryWeeklyProjectionResponse = (
  projection: ReaderSummaryWeeklyProjection,
): ReaderSummaryWeeklyProjectionResponseDto => ({
  schemaVersion: projection.schemaVersion,
  tenantId: projection.tenantId,
  workspaceId: projection.workspaceId,
  weekStartedOn: projection.weekStartedOn,
  weekEndedOn: projection.weekEndedOn,
  status: projection.status,
  certifiedDailyEvidenceDates: projection.certifiedDailyEvidenceDates,
  missingDailyEvidenceDates: projection.missingDailyEvidenceDates,
  blockingReasons: projection.blockingReasons,
  activeWeeklyCertifiedArtifactPresent:
    projection.activeWeeklyCertifiedArtifactPresent,
  evidenceLimitations: projection.evidenceLimitations,
  artifact:
    projection.artifact === null
      ? null
      : weeklyArtifactResponse(projection.artifact),
});

const weeklyArtifactResponse = (
  persisted: NonNullable<ReaderSummaryWeeklyProjection["artifact"]>,
): ReaderSummaryWeeklyProjectionArtifactDto => {
  const output = persisted.artifact.output;
  const proof = persisted.proof;
  return {
    artifactId: persisted.artifactId,
    schemaVersion: output.schemaVersion,
    sealId: output.sealId,
    sealSha256: output.sealSha,
    publicationProofId: proof.authorizationId,
    publicationProofSha256: proof.sha256,
    modelInputSealId: proof.modelInputSealId,
    modelInputSealSha256: proof.modelInputSealSha256,
    artifactSha256: proof.artifactSha256,
    editorialQualitySha256: proof.editorialQualitySha256,
    headline: output.headline,
    headlineCitationIds: output.headlineCitationIds,
    takeaway: output.takeaway,
    takeawayCitationIds: output.takeawayCitationIds,
    synthesis: output.synthesis,
    synthesisCitationIds: output.synthesisCitationIds,
    stories: output.stories,
    sections: output.sections,
    citations: proof.citations,
  };
};
