import { canonicalGitHubRepositoryIdentity } from "../policies/reader-summary-github-projection-audit";
import { maxGitHubTrendingDisplayRepositories } from "../policies/reader-summary-github-trending-policy";
import {
  assertReaderSummaryWeeklyExactObject,
  exactReaderSummaryWeeklyIdentity,
  exactReaderSummaryWeeklySha256,
  exactReaderSummaryWeeklyUtcDay,
  exactReaderSummaryWeeklyUtcTimestamp,
} from "./reader-summary-weekly-canonical-json";
import type { ReaderSummaryWeeklyPublicationGitHubEvidence } from "./reader-summary-weekly-publication-github-evidence";

const repositoryEvidenceKeys = [
  "rank",
  "citationId",
  "feedItemId",
  "sourceItemId",
  "repositoryIdentity",
  "canonicalUrl",
  "sourceContentHash",
  "sourceProviderContentHash",
] as const;

export const assertGitHubEvidenceMode = (
  evidence: ReaderSummaryWeeklyPublicationGitHubEvidence,
): void => {
  exactReaderSummaryWeeklyUtcDay(evidence.requestedUtcDay);
  if (
    evidence.providerKey !== "github-trending-page" ||
    !Number.isSafeInteger(evidence.evidenceCount) ||
    evidence.evidenceCount < 0
  ) {
    throw new Error(
      "Reader summary weekly publication GitHub evidence mode is invalid",
    );
  }
  const verified =
    evidence.mode === "verified" &&
    evidence.evidenceCount === 10 &&
    evidence.repositories.length === 10 &&
    evidence.scanJobId !== null &&
    evidence.sourceBindingId !== null &&
    evidence.sourceProviderContentHash !== null &&
    evidence.historicalUnavailableReason === null &&
    evidence.authorizedAt === null;
  const ordinary =
    evidence.mode === "ordinary_not_required" &&
    evidence.evidenceCount === 0 &&
    evidence.repositories.length === 0 &&
    evidence.scanJobId === null &&
    evidence.sourceBindingId === null &&
    evidence.sourceProviderContentHash === null &&
    evidence.historicalUnavailableReason === null &&
    evidence.authorizedAt === null;
  const historical =
    evidence.mode === "historical_unavailable" &&
    evidence.evidenceCount === 0 &&
    evidence.repositories.length === 0 &&
    evidence.scanJobId === null &&
    evidence.sourceBindingId === null &&
    evidence.sourceProviderContentHash === null &&
    evidence.historicalUnavailableReason !== null &&
    evidence.historicalUnavailableReason ===
      evidence.historicalUnavailableReason.trim() &&
    evidence.historicalUnavailableReason.length > 0 &&
    evidence.historicalUnavailableReason.length <= 4_096 &&
    evidence.authorizedAt !== null;
  const archived =
    evidence.mode === "archived_verified" &&
    evidence.evidenceCount === evidence.repositories.length &&
    evidence.repositories.length >= 1 &&
    evidence.repositories.length <= maxGitHubTrendingDisplayRepositories &&
    evidence.scanJobId === null &&
    evidence.sourceBindingId !== null &&
    evidence.sourceProviderContentHash !== null &&
    evidence.historicalUnavailableReason === null &&
    evidence.authorizedAt === null;
  if (!verified && !ordinary && !historical && !archived) {
    throw new Error(
      "Reader summary weekly publication GitHub evidence mode is invalid",
    );
  }
  if (historical) {
    const authorizedAt = exactReaderSummaryWeeklyUtcTimestamp(
      evidence.authorizedAt,
      "historical GitHub authorizedAt",
    );
    if (
      Date.parse(authorizedAt) <
      Date.parse(`${evidence.requestedUtcDay}T00:00:00.000Z`) + 86_400_000
    ) {
      throw new Error(
        "Reader summary weekly historical GitHub authorization is invalid",
      );
    }
    return;
  }
  if (ordinary) {
    return;
  }
  const scanJobId =
    evidence.scanJobId === null
      ? null
      : exactReaderSummaryWeeklyIdentity(
          evidence.scanJobId,
          "GitHub scan job id",
        );
  const sourceBindingId = exactReaderSummaryWeeklyIdentity(
    evidence.sourceBindingId,
    "GitHub source binding id",
  );
  const providerContentHash = exactReaderSummaryWeeklySha256(
    evidence.sourceProviderContentHash,
    "GitHub provider content hash",
  );
  const identities = {
    citations: new Set<string>(),
    feeds: new Set<string>(),
    sources: new Set<string>(),
    repositories: new Set<string>(),
  };
  evidence.repositories.forEach((repository, index) => {
    assertReaderSummaryWeeklyExactObject(
      repository,
      repositoryEvidenceKeys,
      "publication GitHub repository",
      { allowAuthoritativeHashes: true },
    );
    if (repository.rank !== index + 1) {
      throw new Error(
        "Reader summary weekly publication GitHub board is not exact",
      );
    }
    identities.citations.add(
      exactReaderSummaryWeeklyIdentity(
        repository.citationId,
        "GitHub citation id",
      ),
    );
    identities.feeds.add(
      exactReaderSummaryWeeklyIdentity(
        repository.feedItemId,
        "GitHub feed item id",
      ),
    );
    identities.sources.add(
      exactReaderSummaryWeeklyIdentity(
        repository.sourceItemId,
        "GitHub source item id",
      ),
    );
    identities.repositories.add(
      exactReaderSummaryWeeklyIdentity(
        repository.repositoryIdentity,
        "GitHub repository identity",
      ),
    );
    exactReaderSummaryWeeklyIdentity(
      repository.canonicalUrl,
      "GitHub canonical URL",
    );
    if (
      canonicalGitHubRepositoryIdentity(repository.canonicalUrl) !==
      repository.repositoryIdentity
    ) {
      throw new Error(
        "Reader summary weekly publication GitHub board is not exact",
      );
    }
    exactReaderSummaryWeeklySha256(
      repository.sourceContentHash,
      "GitHub source content hash",
    );
    if (
      exactReaderSummaryWeeklySha256(
        repository.sourceProviderContentHash,
        "GitHub provider content hash",
      ) !== providerContentHash
    ) {
      throw new Error(
        "Reader summary weekly publication GitHub board is not exact",
      );
    }
  });
  if (
    (scanJobId !== null && scanJobId.length === 0) ||
    sourceBindingId.length === 0 ||
    Object.values(identities).some(
      (identity) => identity.size !== evidence.repositories.length,
    )
  ) {
    throw new Error(
      "Reader summary weekly publication GitHub board is not exact",
    );
  }
};
