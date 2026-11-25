import {
  readerSummaryWeeklyModelOutputSchemaVersion,
  type ReaderSummaryWeeklyModelInput,
} from "../../ports/reader-summary-weekly-model.port";

/**
 * Trusted, validated certification and seal receipts for the weekly prompt.
 * Provider-supplied stories, observations, and citations are deliberately
 * excluded; the caller serializes those in untrustedEvidenceData.
 */
export const buildWeeklyPromptCertificationContract = (
  input: ReaderSummaryWeeklyModelInput,
) => ({
  inputSchemaVersion: input.schemaVersion,
  outputSchemaVersion: readerSummaryWeeklyModelOutputSchemaVersion,
  sealId: input.sealId,
  sealSha: input.sealSha,
  manifestSealId: input.manifestSealId,
  manifestSealSha: input.manifestSealSha,
  weekStartedOn: input.weekStartedOn,
  weekEndedOn: input.weekEndedOn,
  certifiedDays: input.days.map((day) => ({
    date: day.date,
    dailyCertificationId: day.dailyCertificationId,
    dailyCertificationSha: day.dailyCertificationSha,
    dailyCertificationStatus: day.dailyCertificationStatus,
    githubBoardId: day.githubBoardId,
    githubBoardSha: day.githubBoardSha,
    githubBoardStatus: day.githubBoardStatus,
    providerCounts: day.providerCounts,
  })),
});
