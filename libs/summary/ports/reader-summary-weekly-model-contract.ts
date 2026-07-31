import type { ReaderSummaryWeeklyManifestScope } from "../domain/value-objects/reader-summary-weekly-canonical-json";
import type { ReaderSummaryWeeklyCanonicalProviderKey } from "../domain/value-objects/reader-summary-weekly-daily-certification";
import type {
  readerSummaryWeeklyHistoricalGitHubAuthorizationIdentity,
  readerSummaryWeeklyHistoricalGitHubDate,
  ReaderSummaryWeeklySealedInputManifest,
} from "../domain/value-objects/reader-summary-weekly-input-manifest";

export const readerSummaryWeeklyModelInputSchemaVersion =
  "reader_summary.weekly_model_input.v1" as const;
export const readerSummaryWeeklyModelOutputSchemaVersion =
  "reader_summary.weekly_model_output.v1" as const;
export const readerSummaryWeeklyClaimTypes =
  ["snapshot", "evolution", "resolution"] as const;
export const readerSummaryWeeklyStoryStatuses =
  ["new", "developing", "resolved", "watch"] as const;
export const readerSummaryWeeklySectionKinds =
  ["lead", "development", "why_it_matters", "watch"] as const;
export type ReaderSummaryWeeklyClaimType =
  (typeof readerSummaryWeeklyClaimTypes)[number];
export type ReaderSummaryWeeklyStoryStatus =
  (typeof readerSummaryWeeklyStoryStatuses)[number];
export type ReaderSummaryWeeklySectionKind =
  (typeof readerSummaryWeeklySectionKinds)[number];
export type ReaderSummaryWeeklyModelStoryEvidence = Readonly<{
  storyId: string; label: string;
}>;
export type ReaderSummaryWeeklyModelObservationEvidence = Readonly<{
  observationId: string; storyId: string; observedOn: string;
  providerKey: ReaderSummaryWeeklyCanonicalProviderKey; text: string;
  claimSupport: readonly ReaderSummaryWeeklyClaimType[];
  citationIds: readonly string[]; dailyCertificationId: string;
  dailyCertificationSha: string; sourceSha256: string;
}>;
export type ReaderSummaryWeeklyModelCitationEvidence = Readonly<{
  citationId: string; observationId: string; storyId: string;
  observedOn: string; providerKey: ReaderSummaryWeeklyCanonicalProviderKey;
  title: string; canonicalUrl: string; dailyCertificationId: string;
  dailyCertificationSha: string; sourceSha256: string;
}>;
export type ReaderSummaryWeeklyModelEvidenceInput = Readonly<{
  manifest: ReaderSummaryWeeklySealedInputManifest;
  stories: readonly ReaderSummaryWeeklyModelStoryEvidence[];
  observations: readonly ReaderSummaryWeeklyModelObservationEvidence[];
  citations: readonly ReaderSummaryWeeklyModelCitationEvidence[];
}>;
export type ReaderSummaryWeeklyModelProviderCount = Readonly<{
  providerKey: ReaderSummaryWeeklyCanonicalProviderKey; count: number;
}>;
type ReaderSummaryWeeklyVerifiedModelDay = Readonly<{
  date: string; dailyCertificationId: string; dailyCertificationSha: string;
  dailyCertificationStatus: "certified"; githubBoardId: string;
  githubBoardSha: string; githubBoardStatus: "verified";
  providerCounts: readonly ReaderSummaryWeeklyModelProviderCount[];
}>;
type ReaderSummaryWeeklyHistoricalModelDay = Readonly<{
  date: typeof readerSummaryWeeklyHistoricalGitHubDate;
  dailyCertificationId: string; dailyCertificationSha: string;
  dailyCertificationStatus: "certified"; githubBoardId: string;
  githubBoardSha: string; githubBoardStatus: "historical_unavailable";
  githubAuthorizationIdentity:
    typeof readerSummaryWeeklyHistoricalGitHubAuthorizationIdentity;
  providerCounts: readonly ReaderSummaryWeeklyModelProviderCount[];
}>;
export type ReaderSummaryWeeklyModelDay =
  | ReaderSummaryWeeklyVerifiedModelDay
  | ReaderSummaryWeeklyHistoricalModelDay;
export type ReaderSummaryWeeklyModelStory =
  ReaderSummaryWeeklyModelStoryEvidence;
export type ReaderSummaryWeeklyModelObservation =
  ReaderSummaryWeeklyModelObservationEvidence;
export type ReaderSummaryWeeklyModelCitation =
  ReaderSummaryWeeklyModelCitationEvidence;
export type ReaderSummaryWeeklyModelInput = Readonly<{
  schemaVersion: typeof readerSummaryWeeklyModelInputSchemaVersion;
  sealId: string; sealSha: string; manifestSealId: string;
  manifestSealSha: string; tenantId: string; workspaceId: string;
  scope: ReaderSummaryWeeklyManifestScope; weekStartedOn: string;
  weekEndedOn: string; days: readonly ReaderSummaryWeeklyModelDay[];
  stories: readonly ReaderSummaryWeeklyModelStory[];
  observations: readonly ReaderSummaryWeeklyModelObservation[];
  citations: readonly ReaderSummaryWeeklyModelCitation[];
}>;
export type ReaderSummaryWeeklyModelOutputStory = Readonly<{
  storyId: string; headline: string; summary: string;
  status: ReaderSummaryWeeklyStoryStatus; observedFrom: string;
  observedThrough: string; citationIds: readonly string[];
}>;
export type ReaderSummaryWeeklyModelOutputSection = Readonly<{
  sectionId: string; storyId: string; kind: ReaderSummaryWeeklySectionKind;
  claimType: ReaderSummaryWeeklyClaimType; heading: string; text: string;
  observedFrom: string; observedThrough: string; citationIds: readonly string[];
}>;
export type ReaderSummaryWeeklyModelOutput = Readonly<{
  schemaVersion: typeof readerSummaryWeeklyModelOutputSchemaVersion;
  sealId: string; sealSha: string; weekStartedOn: string; weekEndedOn: string;
  headline: string; headlineCitationIds: readonly string[]; takeaway: string;
  takeawayCitationIds: readonly string[]; synthesis: string;
  synthesisCitationIds: readonly string[];
  stories: readonly ReaderSummaryWeeklyModelOutputStory[];
  sections: readonly ReaderSummaryWeeklyModelOutputSection[];
}>;

export interface ReaderSummaryWeeklyModelPort {
  generate(input: ReaderSummaryWeeklyModelInput):
    Promise<ReaderSummaryWeeklyModelOutput>;
}
