import type { ReaderSummaryWeeklyArtifactProps } from "../entities/reader-summary-weekly-artifact";
import type { ReaderSummaryWeeklyStoryAuthorityBinding } from "../value-objects/reader-summary-weekly-story-authority";
import type { ReaderSummaryWeeklySealedInputManifest } from "../value-objects/reader-summary-weekly-input-manifest";

export const authorityProof = (
  authority: ReaderSummaryWeeklyStoryAuthorityBinding,
  day: ReaderSummaryWeeklySealedInputManifest["days"][number],
) => ({
  requestedUtcDate: authority.requestedUtcDate,
  publicationId: authority.publicationId,
  publicationEvidenceIdentity: authority.publicationEvidenceIdentity,
  publicationEvidenceSha256: authority.publicationEvidenceSha256,
  storyAuthorityIdentity: authority.identity,
  storyAuthoritySha256: authority.sha256,
  githubBoardIdentity: day.githubAudit.identity,
  githubBoardSha256: day.githubAudit.sha256,
});

export const certifiedAuthorityProof = (
  authority: ReaderSummaryWeeklyStoryAuthorityBinding,
  day: ReaderSummaryWeeklyArtifactProps["input"]["days"][number],
) => ({
  requestedUtcDate: authority.requestedUtcDate,
  publicationId: authority.publicationId,
  publicationEvidenceIdentity: authority.publicationEvidenceIdentity,
  publicationEvidenceSha256: authority.publicationEvidenceSha256,
  storyAuthorityIdentity: authority.identity,
  storyAuthoritySha256: authority.sha256,
  githubBoardIdentity: day.githubBoardId,
  githubBoardSha256: day.githubBoardSha,
});
