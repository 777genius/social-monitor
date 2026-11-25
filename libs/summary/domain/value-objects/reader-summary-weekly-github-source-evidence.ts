import { normalizeGitHubRepositoryFullName } from "./github-repository-identity";
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

export const readerSummaryWeeklyGitHubProviderKey =
  "github-trending-page" as const;
export const readerSummaryWeeklyGitHubEvidenceKind =
  "github_trending_daily" as const;
export const readerSummaryWeeklyGitHubObservationGraceMs = 300_000;
export const readerSummaryWeeklyGitHubRepositoryCount = 10;
export const readerSummaryWeeklyGitHubSourceEvidenceSchemaVersion =
  "reader_summary.weekly_github_source_evidence.v1" as const;
export const readerSummaryWeeklyGitHubBoardEvidenceSchemaVersion =
  "reader_summary.weekly_github_board_evidence.v1" as const;

export type ReaderSummaryWeeklyGitHubProviderAuthority = Readonly<{
  requestedUtcDay: string;
  scanJobId: string;
  providerKey: typeof readerSummaryWeeklyGitHubProviderKey;
  kind: typeof readerSummaryWeeklyGitHubEvidenceKind;
  sourceBindingId: string;
  fetchStartedAt: string;
  checkedAt: string;
  observedAt: string;
}>;

export type ReaderSummaryWeeklyGitHubSourceFields = Readonly<{
  heading: string;
  description: string | null;
  primaryLanguage: string | null;
  starsToday: number;
  totalStars: number;
  forks: number;
}>;

export type ReaderSummaryWeeklyGitHubRepositoryEvidenceInput =
  ReaderSummaryWeeklyGitHubProviderAuthority &
    Readonly<{
      publishedAt: string;
      rank: number;
      canonicalUrl: string;
      sourceEvidence: ReaderSummaryWeeklyGitHubSourceFields;
    }>;

export type ReaderSummaryWeeklyCanonicalGitHubSourceEvidence = Readonly<{
  rank: number;
  canonicalUrl: string;
  repositoryIdentity: string;
  publishedAt: string;
  sourceEvidence: ReaderSummaryWeeklyGitHubSourceFields;
  sourceContentHash: string;
}>;

const authorityKeys = [
  "requestedUtcDay",
  "scanJobId",
  "providerKey",
  "kind",
  "sourceBindingId",
  "fetchStartedAt",
  "checkedAt",
  "observedAt",
] as const;
const repositoryKeys = [
  ...authorityKeys,
  "publishedAt",
  "rank",
  "canonicalUrl",
  "sourceEvidence",
] as const;
const sourceEvidenceKeys = [
  "heading",
  "description",
  "primaryLanguage",
  "starsToday",
  "totalStars",
  "forks",
] as const;
const canonicalSourceEvidenceKeys = [
  "rank",
  "canonicalUrl",
  "repositoryIdentity",
  "publishedAt",
  "sourceEvidence",
  "sourceContentHash",
] as const;

export const canonicalReaderSummaryWeeklyGitHubProviderAuthority = (
  input: ReaderSummaryWeeklyGitHubProviderAuthority,
): ReaderSummaryWeeklyGitHubProviderAuthority => {
  assertReaderSummaryWeeklyExactObject(
    input,
    authorityKeys,
    "GitHub provider authority",
  );
  if (
    input.providerKey !== readerSummaryWeeklyGitHubProviderKey ||
    input.kind !== readerSummaryWeeklyGitHubEvidenceKind
  ) {
    throw new Error(
      "Reader summary weekly GitHub evidence provider and kind are invalid",
    );
  }
  const requestedUtcDay = exactReaderSummaryWeeklyUtcDay(
    input.requestedUtcDay,
  );
  const fetchStartedAt = boundedDayTimestamp(
    input.fetchStartedAt,
    requestedUtcDay,
    "GitHub fetchStartedAt",
  );
  const checkedAt = boundedDayTimestamp(
    input.checkedAt,
    requestedUtcDay,
    "GitHub checkedAt",
  );
  const observedAt = boundedObservation(
    input.observedAt,
    requestedUtcDay,
    "GitHub observedAt",
  );
  if (
    Date.parse(fetchStartedAt) > Date.parse(checkedAt) ||
    Date.parse(checkedAt) > Date.parse(observedAt)
  ) {
    throw new Error(
      "Reader summary weekly GitHub snapshot timestamps are incoherent",
    );
  }
  return deepFreezeReaderSummaryWeekly({
    requestedUtcDay,
    scanJobId: exactReaderSummaryWeeklyIdentity(
      input.scanJobId,
      "GitHub scan job id",
    ),
    providerKey: readerSummaryWeeklyGitHubProviderKey,
    kind: readerSummaryWeeklyGitHubEvidenceKind,
    sourceBindingId: exactReaderSummaryWeeklyIdentity(
      input.sourceBindingId,
      "GitHub source binding id",
    ),
    fetchStartedAt,
    checkedAt,
    observedAt,
  });
};

export const certifyReaderSummaryWeeklyGitHubSourceEvidence = (
  input: ReaderSummaryWeeklyGitHubRepositoryEvidenceInput,
  authority: ReaderSummaryWeeklyGitHubProviderAuthority,
): ReaderSummaryWeeklyCanonicalGitHubSourceEvidence => {
  canonicalizeReaderSummaryWeeklyJson(input, "GitHub source evidence input");
  const canonicalAuthority =
    canonicalReaderSummaryWeeklyGitHubProviderAuthority(authority);
  assertReaderSummaryWeeklyExactObject(
    input,
    repositoryKeys,
    `GitHub source evidence for ${canonicalAuthority.requestedUtcDay}`,
  );
  assertSourceAuthority(input, canonicalAuthority);
  if (
    !Number.isSafeInteger(input.rank) ||
    input.rank < 1 ||
    input.rank > readerSummaryWeeklyGitHubRepositoryCount
  ) {
    throw new Error(
      `Reader summary weekly GitHub rank for ${canonicalAuthority.requestedUtcDay} must be a safe integer from 1 through 10`,
    );
  }
  const repository = canonicalGitHubRepository(input.canonicalUrl);
  if (repository === undefined) {
    throw new Error(
      `Reader summary weekly GitHub repository for ${canonicalAuthority.requestedUtcDay} must use a canonical GitHub URL`,
    );
  }
  const publishedAt = boundedDayTimestamp(
    input.publishedAt,
    canonicalAuthority.requestedUtcDay,
    "GitHub publishedAt",
  );
  if (
    Date.parse(publishedAt) < Date.parse(canonicalAuthority.fetchStartedAt) ||
    Date.parse(publishedAt) > Date.parse(canonicalAuthority.observedAt)
  ) {
    throw new Error(
      `Reader summary weekly GitHub publishedAt for ${canonicalAuthority.requestedUtcDay} must bind the scan window`,
    );
  }
  const sourceEvidence = canonicalSourceFields(input.sourceEvidence);
  const evidenceBody = deepFreezeReaderSummaryWeekly({
    schemaVersion: readerSummaryWeeklyGitHubSourceEvidenceSchemaVersion,
    ...canonicalAuthority,
    publishedAt,
    rank: input.rank,
    canonicalUrl: repository.canonicalUrl,
    repositoryIdentity: repository.identity,
    sourceEvidence,
  });
  const sourceContentHash = canonicalizeReaderSummaryWeeklyJson(
    evidenceBody,
    `GitHub repository source evidence ${input.rank}`,
  ).sha256;
  return deepFreezeReaderSummaryWeekly({
    rank: input.rank,
    canonicalUrl: repository.canonicalUrl,
    repositoryIdentity: repository.identity,
    publishedAt,
    sourceEvidence,
    sourceContentHash,
  });
};

export const deriveReaderSummaryWeeklyGitHubBoardContentHash = (
  authority: ReaderSummaryWeeklyGitHubProviderAuthority,
  repositories: readonly ReaderSummaryWeeklyCanonicalGitHubSourceEvidence[],
): string => {
  const canonicalAuthority =
    canonicalReaderSummaryWeeklyGitHubProviderAuthority(authority);
  assertReaderSummaryWeeklyDenseArray(
    repositories,
    "GitHub board source evidence",
  );
  if (
    repositories.length !== readerSummaryWeeklyGitHubRepositoryCount ||
    repositories.some((repository, index) => repository.rank !== index + 1)
  ) {
    throw new Error(
      "Reader summary weekly GitHub board hash requires ordered ranks 1 through 10",
    );
  }
  const repositorySourceContentHashes = repositories.map(
    (repository, index) => {
      assertReaderSummaryWeeklyExactObject(
        repository,
        canonicalSourceEvidenceKeys,
        `canonical GitHub source evidence ${index + 1}`,
        { allowAuthoritativeHashes: true },
      );
      const expected = certifyReaderSummaryWeeklyGitHubSourceEvidence(
        {
          ...canonicalAuthority,
          publishedAt: repository.publishedAt,
          rank: repository.rank,
          canonicalUrl: repository.canonicalUrl,
          sourceEvidence: repository.sourceEvidence,
        },
        canonicalAuthority,
      );
      if (
        repository.repositoryIdentity !== expected.repositoryIdentity ||
        exactReaderSummaryWeeklySha256(
          repository.sourceContentHash,
          "GitHub repository source content hash",
        ) !== expected.sourceContentHash
      ) {
        throw new Error(
          "Reader summary weekly GitHub board contains forged source evidence",
        );
      }
      return expected.sourceContentHash;
    },
  );
  return canonicalizeReaderSummaryWeeklyJson(
    {
      schemaVersion: readerSummaryWeeklyGitHubBoardEvidenceSchemaVersion,
      ...canonicalAuthority,
      repositorySourceContentHashes,
    },
    "GitHub provider board evidence",
  ).sha256;
};

const assertSourceAuthority = (
  input: ReaderSummaryWeeklyGitHubRepositoryEvidenceInput,
  authority: ReaderSummaryWeeklyGitHubProviderAuthority,
): void => {
  for (const key of authorityKeys) {
    if (input[key] !== authority[key]) {
      throw new Error(
        `Reader summary weekly GitHub repositories for ${authority.requestedUtcDay} must bind one coherent scan snapshot`,
      );
    }
  }
};

const canonicalSourceFields = (
  input: ReaderSummaryWeeklyGitHubSourceFields,
): ReaderSummaryWeeklyGitHubSourceFields => {
  assertReaderSummaryWeeklyExactObject(
    input,
    sourceEvidenceKeys,
    "GitHub repository source fields",
  );
  return deepFreezeReaderSummaryWeekly({
    heading: exactReaderSummaryWeeklyIdentity(
      input.heading,
      "GitHub source heading",
    ),
    description: boundedOptionalText(
      input.description,
      "GitHub source description",
      4_096,
    ),
    primaryLanguage:
      input.primaryLanguage === null
        ? null
        : exactReaderSummaryWeeklyIdentity(
            input.primaryLanguage,
            "GitHub source primary language",
          ),
    starsToday: nonnegativeSafeInteger(
      input.starsToday,
      "GitHub source stars today",
    ),
    totalStars: nonnegativeSafeInteger(
      input.totalStars,
      "GitHub source total stars",
    ),
    forks: nonnegativeSafeInteger(input.forks, "GitHub source forks"),
  });
};

const boundedOptionalText = (
  value: unknown,
  label: string,
  maximumLength: number,
): string | null => {
  if (value === null) {
    return null;
  }
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximumLength ||
    value !== value.trim() ||
    value.includes("\0")
  ) {
    throw new Error(`Reader summary weekly ${label} is invalid`);
  }
  return value;
};

const nonnegativeSafeInteger = (value: unknown, label: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`Reader summary weekly ${label} is invalid`);
  }
  return value as number;
};

const boundedDayTimestamp = (
  value: unknown,
  requestedUtcDay: string,
  label: string,
): string => {
  const timestamp = exactReaderSummaryWeeklyUtcTimestamp(value, label);
  const start = Date.parse(`${requestedUtcDay}T00:00:00.000Z`);
  const actual = Date.parse(timestamp);
  if (actual < start || actual >= start + 86_400_000) {
    throw new Error(
      `Reader summary weekly ${label} must be inside requested UTC day ${requestedUtcDay}`,
    );
  }
  return timestamp;
};

const boundedObservation = (
  value: unknown,
  requestedUtcDay: string,
  label: string,
): string => {
  const timestamp = exactReaderSummaryWeeklyUtcTimestamp(value, label);
  const start = Date.parse(`${requestedUtcDay}T00:00:00.000Z`);
  const actual = Date.parse(timestamp);
  if (
    actual < start ||
    actual > start + 86_400_000 + readerSummaryWeeklyGitHubObservationGraceMs
  ) {
    throw new Error(
      `Reader summary weekly ${label} exceeds the observation bound`,
    );
  }
  return timestamp;
};

const canonicalGitHubRepository = (
  value: unknown,
): Readonly<{ canonicalUrl: string; identity: string }> | undefined => {
  if (typeof value !== "string" || value !== value.trim()) {
    return undefined;
  }
  const match = value.match(
    /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/(?![A-Za-z0-9_.-]+\.git$)([A-Za-z0-9_.-]+)$/u,
  );
  const identity =
    match === null
      ? undefined
      : normalizeGitHubRepositoryFullName(`${match[1]}/${match[2]}`);
  if (identity === undefined) {
    return undefined;
  }
  const canonicalUrl = `https://github.com/${identity}`;
  return value === canonicalUrl ? { identity, canonicalUrl } : undefined;
};
