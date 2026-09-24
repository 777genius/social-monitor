import {
  canonicalizeReaderSummaryWeeklyHistoricalArtifactJson,
  canonicalizeReaderSummaryWeeklyJson,
  canonicalizeReaderSummaryWeeklyV3PublicationJson,
  exactReaderSummaryWeeklySha256,
} from "../../../domain/value-objects/reader-summary-weekly-canonical-json";
import {
  assertReaderSummaryWeeklyPublicationGitHubEvidence,
} from "../../../domain/value-objects/reader-summary-weekly-publication-github-evidence";
import type {
  ReaderSummaryWeeklyCanonicalPublicationEvidence,
} from "../../../domain/value-objects/reader-summary-weekly-publication-evidence";

type PersistedHashFields = Readonly<{
  report: unknown;
  reportSha256: string;
  exactProof: unknown;
  proofSha256: string;
  artifactPayloadSha256: string;
  providerEvidence: unknown;
  providerEvidenceSha256: string;
  githubEvidence: unknown;
}>;

export const assertReaderSummaryWeeklyStoryAuthorityPersistedHashes = (
  row: PersistedHashFields,
  publication: ReaderSummaryWeeklyCanonicalPublicationEvidence,
  profile: "legacy" | "v3",
): void => {
  assertReaderSummaryWeeklyPublicationGitHubEvidence(row.githubEvidence);
  const reportArtifactPayload = artifactPayloadFromReport(row.report);
  const canonicalize = profile === "v3"
    ? canonicalizeReaderSummaryWeeklyV3PublicationJson
    : canonicalizeReaderSummaryWeeklyJson;
  const canonicalizeArtifact = profile === "v3"
    ? canonicalizeReaderSummaryWeeklyV3PublicationJson
    : canonicalizeReaderSummaryWeeklyHistoricalArtifactJson;
  const persistedHashes = [
    [canonicalizeArtifact(row.report, "persisted story publication report").sha256,
      row.reportSha256, publication.reportSha256],
    [canonicalize(row.exactProof).sha256,
      row.proofSha256, publication.proofSha256],
    [canonicalizeArtifact(reportArtifactPayload,
      "persisted story publication artifact payload").sha256,
      row.artifactPayloadSha256, publication.artifactPayloadSha256],
    [canonicalize(row.providerEvidence).sha256,
      row.providerEvidenceSha256, publication.providerEvidenceSha256],
  ] as const;
  if (
    persistedHashes.some(
      ([computed, persisted, canonical]) =>
        computed !== exactReaderSummaryWeeklySha256(
          persisted,
          "persisted story publication hash",
        ) || persisted !== canonical,
    ) ||
    canonicalize(row.providerEvidence).json !==
      canonicalize(publication.providerEvidence).json ||
    canonicalizeReaderSummaryWeeklyJson(row.githubEvidence).json !==
      canonicalizeReaderSummaryWeeklyJson(publication.githubEvidence).json
  ) {
    throw new Error(
      "Reader summary weekly story publication persisted hash diverged",
    );
  }
};

const artifactPayloadFromReport = (report: unknown): unknown => {
  if (
    typeof report !== "object" ||
    report === null ||
    Array.isArray(report) ||
    !Object.hasOwn(report, "artifactPayload")
  ) {
    throw new Error(
      "Reader summary weekly story publication report artifact payload is missing",
    );
  }
  return (report as Readonly<Record<string, unknown>>).artifactPayload;
};
