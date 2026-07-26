import {
  assertReaderSummaryWeeklyDenseArray,
  assertReaderSummaryWeeklyExactObject,
  canonicalizeReaderSummaryWeeklyJson,
  deepFreezeReaderSummaryWeekly,
  exactReaderSummaryWeeklySha256,
} from "./reader-summary-weekly-canonical-json";
import {
  canonicalReaderSummaryWeeklyGitHubProviderAuthority,
  certifyReaderSummaryWeeklyGitHubSourceEvidence,
  deriveReaderSummaryWeeklyGitHubBoardContentHash,
  readerSummaryWeeklyGitHubEvidenceKind,
  readerSummaryWeeklyGitHubObservationGraceMs,
  readerSummaryWeeklyGitHubProviderKey,
  readerSummaryWeeklyGitHubRepositoryCount,
  type ReaderSummaryWeeklyCanonicalGitHubSourceEvidence,
  type ReaderSummaryWeeklyGitHubProviderAuthority,
  type ReaderSummaryWeeklyGitHubRepositoryEvidenceInput,
  type ReaderSummaryWeeklyGitHubSourceFields,
} from "./reader-summary-weekly-github-source-evidence";

export {
  readerSummaryWeeklyGitHubEvidenceKind,
  readerSummaryWeeklyGitHubObservationGraceMs,
  readerSummaryWeeklyGitHubProviderKey,
};
export type { ReaderSummaryWeeklyGitHubRepositoryEvidenceInput };

export const readerSummaryWeeklyGitHubAuditSchemaVersion =
  "reader_summary.weekly_github_audit.v1" as const;

export type ReaderSummaryWeeklyGitHubAuditEvidenceInput =
  ReaderSummaryWeeklyGitHubProviderAuthority &
    Readonly<{
      repositories: readonly ReaderSummaryWeeklyGitHubRepositoryEvidenceInput[];
    }>;

export type ReaderSummaryWeeklyCanonicalGitHubRepository = Readonly<{
  rank: number;
  canonicalUrl: string;
  repositoryIdentity: string;
  publishedAt: string;
  sourceEvidence: ReaderSummaryWeeklyGitHubSourceFields;
  sourceContentHash: string;
  sourceProviderContentHash: string;
}>;

export type ReaderSummaryWeeklyCanonicalGitHubAudit =
  ReaderSummaryWeeklyGitHubProviderAuthority &
    Readonly<{
      schemaVersion: typeof readerSummaryWeeklyGitHubAuditSchemaVersion;
      status: "verified";
      sourceProviderContentHash: string;
      repositories: readonly ReaderSummaryWeeklyCanonicalGitHubRepository[];
      identity: string;
      sha256: string;
    }>;

const auditKeys = [
  "requestedUtcDay",
  "scanJobId",
  "providerKey",
  "kind",
  "sourceBindingId",
  "fetchStartedAt",
  "checkedAt",
  "observedAt",
  "repositories",
] as const;
const canonicalAuditKeys = [
  "schemaVersion",
  "status",
  "requestedUtcDay",
  "scanJobId",
  "providerKey",
  "kind",
  "sourceBindingId",
  "fetchStartedAt",
  "checkedAt",
  "observedAt",
  "sourceProviderContentHash",
  "repositories",
  "identity",
  "sha256",
] as const;
const canonicalRepositoryKeys = [
  "rank",
  "canonicalUrl",
  "repositoryIdentity",
  "publishedAt",
  "sourceEvidence",
  "sourceContentHash",
  "sourceProviderContentHash",
] as const;

export const certifyReaderSummaryWeeklyGitHubAudit = (
  input: ReaderSummaryWeeklyGitHubAuditEvidenceInput,
): ReaderSummaryWeeklyCanonicalGitHubAudit => {
  canonicalizeReaderSummaryWeeklyJson(input, "GitHub audit evidence");
  assertReaderSummaryWeeklyExactObject(
    input,
    auditKeys,
    "GitHub audit evidence",
  );
  const authority = readAuthority(input);
  assertReaderSummaryWeeklyDenseArray(input.repositories, "GitHub repositories");
  if (input.repositories.length !== readerSummaryWeeklyGitHubRepositoryCount) {
    throw new Error(
      `Reader summary weekly GitHub audit for ${authority.requestedUtcDay} must contain exactly ranks 1 through 10`,
    );
  }
  const sourceEvidence = input.repositories.map((repository) =>
    certifyReaderSummaryWeeklyGitHubSourceEvidence(repository, authority),
  );
  assertCanonicalBoard(sourceEvidence, authority.requestedUtcDay);
  const sourceProviderContentHash =
    deriveReaderSummaryWeeklyGitHubBoardContentHash(authority, sourceEvidence);
  const repositories = sourceEvidence.map((repository) =>
    deepFreezeReaderSummaryWeekly({
      ...repository,
      sourceProviderContentHash,
    }),
  );
  const body = deepFreezeReaderSummaryWeekly({
    schemaVersion: readerSummaryWeeklyGitHubAuditSchemaVersion,
    status: "verified" as const,
    ...authority,
    sourceProviderContentHash,
    repositories,
  });
  const hash = canonicalizeReaderSummaryWeeklyJson(
    body,
    `GitHub audit ${authority.requestedUtcDay}`,
  ).sha256;
  return deepFreezeReaderSummaryWeekly({
    ...body,
    identity: `${readerSummaryWeeklyGitHubAuditSchemaVersion}:${hash}`,
    sha256: hash,
  });
};

export function assertReaderSummaryWeeklyCanonicalGitHubAudit(
  input: unknown,
): asserts input is ReaderSummaryWeeklyCanonicalGitHubAudit {
  canonicalizeReaderSummaryWeeklyJson(input, "canonical GitHub audit");
  assertReaderSummaryWeeklyExactObject(
    input,
    canonicalAuditKeys,
    "canonical GitHub audit",
    { allowAuthoritativeHashes: true },
  );
  const canonical = input as unknown as ReaderSummaryWeeklyCanonicalGitHubAudit;
  if (
    canonical.schemaVersion !== readerSummaryWeeklyGitHubAuditSchemaVersion ||
    canonical.status !== "verified"
  ) {
    throw new Error("Reader summary weekly canonical GitHub audit is invalid");
  }
  const authority = readAuthority(canonical);
  assertReaderSummaryWeeklyDenseArray(
    canonical.repositories,
    "canonical GitHub repositories",
  );
  if (
    canonical.repositories.length !== readerSummaryWeeklyGitHubRepositoryCount
  ) {
    throw new Error("Reader summary weekly canonical GitHub board is incomplete");
  }
  const sourceEvidence = canonical.repositories.map((repository, index) =>
    rederiveCanonicalRepository(repository, authority, index),
  );
  assertCanonicalBoard(sourceEvidence, authority.requestedUtcDay);
  const providerHash = deriveReaderSummaryWeeklyGitHubBoardContentHash(
    authority,
    sourceEvidence,
  );
  if (
    canonical.sourceProviderContentHash !== providerHash ||
    canonical.repositories.some(
      (repository) => repository.sourceProviderContentHash !== providerHash,
    )
  ) {
    throw new Error(
      "Reader summary weekly canonical GitHub provider seal is invalid",
    );
  }
  const { identity, sha256, ...body } = canonical;
  const expectedHash = canonicalizeReaderSummaryWeeklyJson(
    body,
    "canonical GitHub audit body",
  ).sha256;
  if (
    exactReaderSummaryWeeklySha256(sha256, "canonical GitHub audit hash") !==
      expectedHash ||
    identity !== `${readerSummaryWeeklyGitHubAuditSchemaVersion}:${expectedHash}`
  ) {
    throw new Error("Reader summary weekly canonical GitHub seal is invalid");
  }
}

const readAuthority = (
  input: ReaderSummaryWeeklyGitHubProviderAuthority,
): ReaderSummaryWeeklyGitHubProviderAuthority =>
  canonicalReaderSummaryWeeklyGitHubProviderAuthority({
    requestedUtcDay: input.requestedUtcDay,
    scanJobId: input.scanJobId,
    providerKey: input.providerKey,
    kind: input.kind,
    sourceBindingId: input.sourceBindingId,
    fetchStartedAt: input.fetchStartedAt,
    checkedAt: input.checkedAt,
    observedAt: input.observedAt,
  });

const rederiveCanonicalRepository = (
  input: ReaderSummaryWeeklyCanonicalGitHubRepository,
  authority: ReaderSummaryWeeklyGitHubProviderAuthority,
  index: number,
): ReaderSummaryWeeklyCanonicalGitHubSourceEvidence => {
  assertReaderSummaryWeeklyExactObject(
    input,
    canonicalRepositoryKeys,
    `canonical GitHub repository ${index + 1}`,
    { allowAuthoritativeHashes: true },
  );
  const expected = certifyReaderSummaryWeeklyGitHubSourceEvidence(
    {
      ...authority,
      publishedAt: input.publishedAt,
      rank: input.rank,
      canonicalUrl: input.canonicalUrl,
      sourceEvidence: input.sourceEvidence,
    },
    authority,
  );
  if (
    input.repositoryIdentity !== expected.repositoryIdentity ||
    input.sourceContentHash !== expected.sourceContentHash
  ) {
    throw new Error(
      "Reader summary weekly canonical GitHub source evidence is invalid",
    );
  }
  return expected;
};

const assertCanonicalBoard = (
  repositories: readonly ReaderSummaryWeeklyCanonicalGitHubSourceEvidence[],
  requestedUtcDay: string,
): void => {
  if (
    repositories.some((repository, index) => repository.rank !== index + 1)
  ) {
    throw new Error(
      `Reader summary weekly GitHub audit for ${requestedUtcDay} must contain unique ranks 1 through 10 in canonical order`,
    );
  }
  assertUnique(
    repositories.map((repository) => repository.repositoryIdentity),
    `GitHub repositories for ${requestedUtcDay}`,
  );
  assertUnique(
    repositories.map((repository) => repository.sourceContentHash),
    `GitHub repository content hashes for ${requestedUtcDay}`,
  );
};

const assertUnique = (values: readonly string[], label: string): void => {
  if (new Set(values).size !== values.length) {
    throw new Error(`Reader summary weekly GitHub audit has duplicate ${label}`);
  }
};
