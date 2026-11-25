import type { ReaderSummaryArtifact } from "../entities/reader-summary-artifact";
import {
  canonicalGitHubRepositoryIdentity,
  readerSummaryHasVerifiedGitHubProjection,
  readerSummaryIsOrdinaryNoSignalWithoutEvidence,
  type ReaderSummaryGitHubProjectionAudit,
} from "../policies/reader-summary-github-projection-audit";
import { maxGitHubTrendingDisplayRepositories } from "../policies/reader-summary-github-trending-policy";
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
import { assertGitHubEvidenceMode } from "./reader-summary-weekly-publication-github-evidence-mode";
export const readerSummaryWeeklyPublicationGitHubEvidenceSchemaVersion =
  "reader_summary.weekly_publication_github_evidence.v1" as const;
export const readerSummaryWeeklyHistoricalUnavailableReasonMode =
  "github_projection_unavailable_historical" as const;
const readerSummaryWeeklyGitHubProviderBoardSchemaVersion =
  "reader_summary.github_provider_board.v1" as const;

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
  mode:
    | "verified"
    | "archived_verified"
    | "ordinary_not_required"
    | "historical_unavailable";
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
    return params.audit.archivedProjection === undefined
      ? sealVerifiedGitHubEvidence(params.audit, requestedUtcDay)
      : sealArchivedVerifiedGitHubEvidence(params.audit, requestedUtcDay);
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

const sealArchivedVerifiedGitHubEvidence = (
  audit: ReaderSummaryGitHubProjectionAudit,
  requestedUtcDay: string,
): ReaderSummaryWeeklyPublicationGitHubEvidence => {
  const bindings = [...(audit.archivedProjection?.bindings ?? [])].sort(
    (left, right) =>
      left.observation.trending.rank - right.observation.trending.rank,
  );
  if (
    bindings.length < 1 ||
    bindings.length > maxGitHubTrendingDisplayRepositories ||
    bindings.some(
      (binding, index) => binding.observation.trending.rank !== index + 1,
    ) ||
    new Set(bindings.map((binding) => binding.sourceBindingId)).size !== 1
  ) {
    throw new Error(
      "Reader summary weekly publication GitHub board is not exact",
    );
  }
  const sourceBindingId = exactReaderSummaryWeeklyIdentity(
    bindings[0]!.sourceBindingId,
    "GitHub source binding id",
  );
  // Mirrors the board seal recorded by
  // record_reader_summary_weekly_publication_evidence_base on prod.
  const sourceProviderContentHash = exactReaderSummaryWeeklySha256(
    canonicalizeReaderSummaryWeeklyJson(
      {
        schemaVersion: readerSummaryWeeklyGitHubProviderBoardSchemaVersion,
        requestedUtcDay,
        scanJobId: null,
        sourceBindingId,
        sourceProviderContentHashes: bindings.map((binding) =>
          exactReaderSummaryWeeklySha256(
            binding.sourceProviderContentHash,
            "GitHub provider content hash",
          ),
        ),
      },
      "GitHub provider board evidence",
    ).sha256,
    "GitHub provider content hash",
  );
  const repositories = bindings.map((binding) =>
    deepFreezeReaderSummaryWeekly({
      rank: binding.observation.trending.rank,
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
        canonicalGitHubRepositoryIdentity(binding.canonicalUrl) ?? "",
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
      sourceProviderContentHash,
    }),
  );
  return sealGitHubEvidence({
    mode: "archived_verified",
    requestedUtcDay,
    providerKey: "github-trending-page",
    scanJobId: null,
    sourceBindingId,
    evidenceCount: repositories.length,
    historicalUnavailableReason: null,
    authorizedAt: null,
    sourceProviderContentHash,
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
