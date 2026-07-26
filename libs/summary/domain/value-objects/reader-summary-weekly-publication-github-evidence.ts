import type { ReaderSummaryArtifact } from "../entities/reader-summary-artifact";
import {
  canonicalGitHubRepositoryIdentity,
  readerSummaryHasVerifiedGitHubProjection,
  readerSummaryIsOrdinaryNoSignalWithoutEvidence,
  type ReaderSummaryGitHubProjectionAudit,
} from "../policies/reader-summary-github-projection-audit";
import {
  assertReaderSummaryWeeklyDenseArray,
  assertReaderSummaryWeeklyExactObject,
  canonicalizeReaderSummaryWeeklyJson,
  deepFreezeReaderSummaryWeekly,
  exactReaderSummaryWeeklyIdentity,
  exactReaderSummaryWeeklySha256,
  exactReaderSummaryWeeklyUtcDay,
  exactReaderSummaryWeeklyUtcTimestamp,
} from "./reader-summary-weekly-canonical-json";

export const readerSummaryWeeklyPublicationGitHubEvidenceSchemaVersion =
  "reader_summary.weekly_publication_github_evidence.v1" as const;
export const readerSummaryWeeklyHistoricalUnavailableReasonMode =
  "github_projection_unavailable_historical" as const;

type RepositoryEvidence = Readonly<{
  rank: number;
  citationId: string;
  feedItemId: string;
  sourceItemId: string;
  repositoryIdentity: string;
  canonicalUrl: string;
  sourceContentHash: string;
  sourceProviderContentHash: string;
}>;

export type ReaderSummaryWeeklyPublicationGitHubEvidence = Readonly<{
  schemaVersion:
    typeof readerSummaryWeeklyPublicationGitHubEvidenceSchemaVersion;
  mode: "verified" | "ordinary_not_required" | "historical_unavailable";
  requestedUtcDay: string;
  providerKey: "github-trending-page";
  scanJobId: string | null;
  sourceBindingId: string | null;
  evidenceCount: number;
  historicalUnavailableReason: string | null;
  authorizedAt: string | null;
  sourceProviderContentHash: string | null;
  repositories: readonly RepositoryEvidence[];
  sha256: string;
}>;

const githubEvidenceKeys = [
  "schemaVersion",
  "mode",
  "requestedUtcDay",
  "providerKey",
  "scanJobId",
  "sourceBindingId",
  "evidenceCount",
  "historicalUnavailableReason",
  "authorizedAt",
  "sourceProviderContentHash",
  "repositories",
  "sha256",
] as const;
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

export const deriveReaderSummaryWeeklyPublicationGitHubEvidence = (params: {
  readonly artifact: ReaderSummaryArtifact;
  readonly audit: ReaderSummaryGitHubProjectionAudit;
}): ReaderSummaryWeeklyPublicationGitHubEvidence => {
  if (
    !readerSummaryHasVerifiedGitHubProjection({
      artifact: params.artifact,
      audit: params.audit,
    })
  ) {
    throw new Error(
      "Reader summary weekly publication requires DB-verifiable GitHub authority",
    );
  }
  const requestedUtcDay = exactReaderSummaryWeeklyUtcDay(
    params.audit.requestedUtcDay,
  );
  if (params.audit.status === "verified") {
    return sealVerifiedGitHubEvidence(params.audit, requestedUtcDay);
  }
  if (params.audit.historicalOmission !== undefined) {
    return sealHistoricalGitHubEvidence(params.audit, requestedUtcDay);
  }
  return sealOrdinaryNotRequiredGitHubEvidence(
    params.artifact,
    params.audit,
    requestedUtcDay,
  );
};

export function assertReaderSummaryWeeklyPublicationGitHubEvidence(
  input: unknown,
): asserts input is ReaderSummaryWeeklyPublicationGitHubEvidence {
  assertReaderSummaryWeeklyExactObject(
    input,
    githubEvidenceKeys,
    "publication GitHub evidence",
    { allowAuthoritativeHashes: true },
  );
  const evidence =
    input as unknown as ReaderSummaryWeeklyPublicationGitHubEvidence;
  assertReaderSummaryWeeklyDenseArray(
    evidence.repositories,
    "publication GitHub repositories",
  );
  const { sha256, ...body } = evidence;
  const expected = canonicalizeReaderSummaryWeeklyJson(
    body,
    "publication GitHub evidence body",
  ).sha256;
  if (
    evidence.schemaVersion !==
      readerSummaryWeeklyPublicationGitHubEvidenceSchemaVersion ||
    exactReaderSummaryWeeklySha256(
      sha256,
      "publication GitHub evidence hash",
    ) !== expected
  ) {
    throw new Error(
      "Reader summary weekly publication GitHub evidence seal is invalid",
    );
  }
  assertGitHubEvidenceMode(evidence);
}

const sealVerifiedGitHubEvidence = (
  audit: ReaderSummaryGitHubProjectionAudit,
  requestedUtcDay: string,
): ReaderSummaryWeeklyPublicationGitHubEvidence => {
  const bindings = [...audit.bindings].sort((left, right) => left.rank - right.rank);
  if (
    bindings.length !== 10 ||
    bindings.some((binding, index) => binding.rank !== index + 1) ||
    new Set(bindings.map((binding) => binding.scanJobId)).size !== 1 ||
    new Set(bindings.map((binding) => binding.sourceBindingId)).size !== 1 ||
    new Set(bindings.map((binding) => binding.sourceProviderContentHash)).size !==
      1
  ) {
    throw new Error(
      "Reader summary weekly publication GitHub board is not exact",
    );
  }
  const repositories = bindings.map((binding) =>
    deepFreezeReaderSummaryWeekly({
      rank: binding.rank,
      citationId: exactReaderSummaryWeeklyIdentity(
        binding.citationId,
        "GitHub citation id",
      ),
      feedItemId: exactReaderSummaryWeeklyIdentity(
        binding.feedItemId,
        "GitHub feed item id",
      ),
      sourceItemId: exactReaderSummaryWeeklyIdentity(
        binding.sourceItemId,
        "GitHub source item id",
      ),
      repositoryIdentity: exactReaderSummaryWeeklyIdentity(
        binding.repositoryIdentity,
        "GitHub repository identity",
      ),
      canonicalUrl: exactReaderSummaryWeeklyIdentity(
        binding.canonicalUrl,
        "GitHub canonical URL",
      ),
      sourceContentHash: exactReaderSummaryWeeklySha256(
        binding.sourceContentHash,
        "GitHub source content hash",
      ),
      sourceProviderContentHash: exactReaderSummaryWeeklySha256(
        binding.sourceProviderContentHash,
        "GitHub provider content hash",
      ),
    }),
  );
  return sealGitHubEvidence({
    mode: "verified",
    requestedUtcDay,
    providerKey: "github-trending-page",
    scanJobId: exactReaderSummaryWeeklyIdentity(
      bindings[0]!.scanJobId,
      "GitHub scan job id",
    ),
    sourceBindingId: exactReaderSummaryWeeklyIdentity(
      bindings[0]!.sourceBindingId,
      "GitHub source binding id",
    ),
    evidenceCount: repositories.length,
    historicalUnavailableReason: null,
    authorizedAt: null,
    sourceProviderContentHash: repositories[0]!.sourceProviderContentHash,
    repositories,
  });
};

const sealHistoricalGitHubEvidence = (
  audit: ReaderSummaryGitHubProjectionAudit,
  requestedUtcDay: string,
): ReaderSummaryWeeklyPublicationGitHubEvidence => {
  const omission = audit.historicalOmission;
  if (
    audit.status !== "not_required" ||
    omission?.mode !== readerSummaryWeeklyHistoricalUnavailableReasonMode ||
    omission.reason !== omission.reason.trim() ||
    omission.reason.length === 0 ||
    omission.reason.length > 4_096
  ) {
    throw new Error(
      "Reader summary weekly historical GitHub reason is not exact",
    );
  }
  return sealGitHubEvidence({
    mode: "historical_unavailable",
    requestedUtcDay,
    providerKey: "github-trending-page",
    scanJobId: null,
    sourceBindingId: null,
    evidenceCount: 0,
    historicalUnavailableReason: omission.reason,
    authorizedAt: exactReaderSummaryWeeklyUtcTimestamp(
      omission.authorizedAt,
      "historical GitHub authorizedAt",
    ),
    sourceProviderContentHash: null,
    repositories: [],
  });
};

const sealOrdinaryNotRequiredGitHubEvidence = (
  artifact: ReaderSummaryArtifact,
  audit: ReaderSummaryGitHubProjectionAudit,
  requestedUtcDay: string,
): ReaderSummaryWeeklyPublicationGitHubEvidence => {
  if (
    audit.status !== "not_required" ||
    audit.historicalOmission !== undefined ||
    audit.pageCount < 1 ||
    audit.scannedItemCount !== 0 ||
    audit.eligibleBindingIds.length !== 0 ||
    audit.bindings.length !== 0 ||
    audit.violationCodes.length !== 0 ||
    audit.reasons.length !== 0 ||
    audit.observedThrough !== undefined ||
    audit.projectionCheckedAt !== undefined ||
    audit.telemetry !== undefined ||
    !readerSummaryIsOrdinaryNoSignalWithoutEvidence(artifact)
  ) {
    throw new Error(
      "Reader summary weekly ordinary GitHub omission is not exact",
    );
  }
  return sealGitHubEvidence({
    mode: "ordinary_not_required",
    requestedUtcDay,
    providerKey: "github-trending-page",
    scanJobId: null,
    sourceBindingId: null,
    evidenceCount: 0,
    historicalUnavailableReason: null,
    authorizedAt: null,
    sourceProviderContentHash: null,
    repositories: [],
  });
};

const sealGitHubEvidence = (
  body: Omit<
    ReaderSummaryWeeklyPublicationGitHubEvidence,
    "schemaVersion" | "sha256"
  >,
): ReaderSummaryWeeklyPublicationGitHubEvidence => {
  const value = deepFreezeReaderSummaryWeekly({
    schemaVersion:
      readerSummaryWeeklyPublicationGitHubEvidenceSchemaVersion,
    ...body,
  });
  return deepFreezeReaderSummaryWeekly({
    ...value,
    sha256: canonicalizeReaderSummaryWeeklyJson(
      value,
      "publication GitHub evidence",
    ).sha256,
  });
};

const assertGitHubEvidenceMode = (
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
  if (!verified && !ordinary && !historical) {
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
  const scanJobId = exactReaderSummaryWeeklyIdentity(
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
    scanJobId.length === 0 ||
    sourceBindingId.length === 0 ||
    Object.values(identities).some((identity) => identity.size !== 10)
  ) {
    throw new Error(
      "Reader summary weekly publication GitHub board is not exact",
    );
  }
};
