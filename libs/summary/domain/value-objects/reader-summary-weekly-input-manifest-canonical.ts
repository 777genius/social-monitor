import {
  assertReaderSummaryWeeklyDenseArray,
  assertReaderSummaryWeeklyExactObject,
  canonicalizeReaderSummaryWeeklyJson,
  canonicalReaderSummaryWeeklyScope,
  deepFreezeReaderSummaryWeekly,
  exactReaderSummaryWeeklyIdentity,
  exactReaderSummaryWeeklySha256,
  exactReaderSummaryWeeklyUtcDay,
  readerSummaryWeeklyScopeKey,
  type ReaderSummaryWeeklyManifestScope,
} from "./reader-summary-weekly-canonical-json";
import {
  readerSummaryWeeklyCanonicalProviderKeys,
  readerSummaryWeeklyDailyCertificationSchemaVersion,
  type ReaderSummaryWeeklyCanonicalDailyCertification,
} from "./reader-summary-weekly-daily-certification";
import {
  assertReaderSummaryWeeklyCanonicalGitHubAudit,
  readerSummaryWeeklyGitHubProviderKey,
} from "./reader-summary-weekly-github-audit";
import {
  assertReaderSummaryWeeklyCanonicalPublicationEvidence,
  readerSummaryWeeklyPublicationEvidenceSchemaVersion,
} from "./reader-summary-weekly-publication-evidence";
import {
  assertReaderSummaryWeeklyPublicationGitHubEvidence,
  readerSummaryWeeklyPublicationGitHubEvidenceSchemaVersion,
} from "./reader-summary-weekly-publication-github-evidence";
import type {
  ReaderSummaryWeeklyCanonicalInputDay,
  ReaderSummaryWeeklyHistoricalDailyCertification,
  ReaderSummaryWeeklyHistoricalGitHubAudit,
  ReaderSummaryWeeklyHistoricalPublicationAuthority,
  ReaderSummaryWeeklyPersistedPublicationEvidence,
} from "./reader-summary-weekly-input-manifest";

export const readerSummaryWeeklyInputManifestSchemaVersion =
  "reader_summary.weekly_input_manifest.v1" as const;
export const readerSummaryWeeklyHistoricalGitHubDate = "2026-07-23" as const;
export const readerSummaryWeeklyHistoricalGitHubAuthorizationIdentity =
  "reader_summary.production_recovery.github.2026-07-23.v2" as const;

const canonicalDayKeys = [
  "requestedUtcDate",
  "githubAudit",
  "dailyCertification",
] as const;
const historicalCanonicalDayKeys = [
  ...canonicalDayKeys,
  "historicalAuthority",
] as const;
const dailyCertificationKeys = [
  "schemaVersion",
  "status",
  "blockingPassed",
  "requestedUtcDate",
  "tenantId",
  "workspaceId",
  "scope",
  "publicationId",
  "artifactId",
  "jobId",
  "reportId",
  "proofId",
  "reportSha256",
  "exactProofSha256",
  "artifactPayloadSha256",
  "providerCounts",
  "githubAuditSha256",
  "identity",
  "sha256",
] as const;
const uniqueDailyIdentityFields = [
  "publicationId",
  "artifactId",
  "jobId",
  "reportId",
  "proofId",
] as const;
const historicalAuthorityBodyKeys = [
  "schemaVersion", "tenantId", "workspaceId", "scope", "period",
  "requestedUtcDate", "publicationId", "artifactId", "jobId", "reportId",
  "proofId", "semanticStatus", "reportSha256", "proofSha256",
  "artifactPayloadSha256", "providerEvidenceSha256", "providerEvidence",
  "providerCounts", "githubEvidence", "publishedAt",
] as const;
const historicalAuthorityKeys = [
  ...historicalAuthorityBodyKeys,
  "identity",
  "sha256",
  "authorizationIdentity",
] as const;

export const assertCanonicalInputDay = (
  day: ReaderSummaryWeeklyCanonicalInputDay,
  requestedUtcDate: string,
  authority: Readonly<{
    tenantId: string;
    workspaceId: string;
    scope: ReaderSummaryWeeklyManifestScope;
  }>,
): void => {
  if (
    exactReaderSummaryWeeklyUtcDay(day.requestedUtcDate) !== requestedUtcDate
  ) {
    throw new Error(
      `Reader summary weekly sealed input day does not bind ${requestedUtcDate}`,
    );
  }
  if ("historicalAuthority" in day) {
    assertReaderSummaryWeeklyExactObject(
      day,
      historicalCanonicalDayKeys,
      `sealed input day ${requestedUtcDate}`,
    );
    const historicalAuthority = assertHistoricalAuthority(
      day.historicalAuthority,
    );
    assertHistoricalSharedAuthority(historicalAuthority, {
      requestedUtcDate,
      ...authority,
    });
    const githubAudit = historicalGitHubAudit(historicalAuthority);
    if (canonicalizeReaderSummaryWeeklyJson(day.githubAudit).json !==
        canonicalizeReaderSummaryWeeklyJson(githubAudit).json) {
      throw new Error(
        "Reader summary weekly historical GitHub authority binding is invalid",
      );
    }
    canonicalHistoricalDailyCertification(
      day.dailyCertification,
      historicalAuthority,
      githubAudit,
      { requestedUtcDate, ...authority },
    );
    return;
  }
  assertReaderSummaryWeeklyExactObject(
    day,
    canonicalDayKeys,
    `sealed input day ${requestedUtcDate}`,
  );
  assertReaderSummaryWeeklyCanonicalGitHubAudit(day.githubAudit);
  if (day.githubAudit.requestedUtcDay !== requestedUtcDate) {
    throw new Error(
      `Reader summary weekly GitHub audit does not bind ${requestedUtcDate}`,
    );
  }
  assertCanonicalDailyCertification(
    day.dailyCertification,
    day.githubAudit,
    { requestedUtcDate, ...authority },
  );
};

export const canonicalHistoricalAuthority = (
  evidence: ReaderSummaryWeeklyPersistedPublicationEvidence,
  authorizationIdentity:
    typeof readerSummaryWeeklyHistoricalGitHubAuthorizationIdentity,
): ReaderSummaryWeeklyHistoricalPublicationAuthority => {
  return assertHistoricalAuthority({
    ...evidence,
    authorizationIdentity,
  });
};

const assertHistoricalAuthority = (
  input: ReaderSummaryWeeklyHistoricalPublicationAuthority,
): ReaderSummaryWeeklyHistoricalPublicationAuthority => {
  assertReaderSummaryWeeklyExactObject(
    input,
    historicalAuthorityKeys,
    "historical publication authority",
    { allowAuthoritativeHashes: true },
  );
  const body = Object.fromEntries(
    historicalAuthorityBodyKeys.map((key) => [key, input[key]]),
  );
  const canonical = canonicalizeReaderSummaryWeeklyJson(
    body,
    "historical publication authority body",
  );
  assertReaderSummaryWeeklyCanonicalPublicationEvidence({
    ...body,
    identity: input.identity,
    sha256: input.sha256,
    canonicalJson: canonical.json,
    byteLength: canonical.byteLength,
    toBytes: (): Uint8Array => canonical.toBytes(),
  });
  const github = input.githubEvidence;
  assertReaderSummaryWeeklyPublicationGitHubEvidence(github);
  const githubCount = input.providerCounts.find(
    (entry) => entry.providerKey === readerSummaryWeeklyGitHubProviderKey,
  )?.count;
  if (
    input.schemaVersion !== readerSummaryWeeklyPublicationEvidenceSchemaVersion ||
    input.authorizationIdentity !==
      readerSummaryWeeklyHistoricalGitHubAuthorizationIdentity ||
    input.requestedUtcDate !== readerSummaryWeeklyHistoricalGitHubDate ||
    input.semanticStatus !== "COMPLETED" ||
    github.schemaVersion !==
      readerSummaryWeeklyPublicationGitHubEvidenceSchemaVersion ||
    github.mode !== "historical_unavailable" ||
    github.providerKey !== readerSummaryWeeklyGitHubProviderKey ||
    github.requestedUtcDay !== readerSummaryWeeklyHistoricalGitHubDate ||
    github.evidenceCount !== 0 ||
    github.scanJobId !== null ||
    github.sourceBindingId !== null ||
    github.sourceProviderContentHash !== null ||
    github.repositories.length !== 0 ||
    githubCount !== 0 ||
    input.providerEvidence.some(
      (entry) => entry.providerKey === readerSummaryWeeklyGitHubProviderKey,
    ) ||
    input.identity !==
      `${readerSummaryWeeklyPublicationEvidenceSchemaVersion}:${input.sha256}` ||
    exactReaderSummaryWeeklySha256(
      input.sha256,
      "historical publication authority hash",
    ) !== canonical.sha256
  ) {
    throw new Error(
      "Reader summary weekly historical GitHub recovery authority is invalid",
    );
  }
  return deepFreezeReaderSummaryWeekly(input);
};

export const historicalGitHubAudit = (
  authority: ReaderSummaryWeeklyHistoricalPublicationAuthority,
): ReaderSummaryWeeklyHistoricalGitHubAudit => {
  const githubEvidence = canonicalClone(authority.githubEvidence);
  return deepFreezeReaderSummaryWeekly({
    ...githubEvidence,
    status: "historical_unavailable" as const,
    authorizationIdentity: authority.authorizationIdentity,
    identity:
      `${authority.githubEvidence.schemaVersion}:${authority.githubEvidence.sha256}`,
  });
};

export const canonicalHistoricalDailyCertification = (
  input: ReaderSummaryWeeklyHistoricalDailyCertification,
  authority: ReaderSummaryWeeklyHistoricalPublicationAuthority,
  githubAudit: ReaderSummaryWeeklyHistoricalGitHubAudit,
  expected: Readonly<{
    requestedUtcDate: string;
    tenantId: string;
    workspaceId: string;
    scope: ReaderSummaryWeeklyManifestScope;
  }>,
): ReaderSummaryWeeklyHistoricalDailyCertification => {
  const certification = canonicalClone(input);
  assertCanonicalDailyCertification(certification, githubAudit, expected);
  if (
    certification.requestedUtcDate !==
      readerSummaryWeeklyHistoricalGitHubDate ||
    certification.publicationId !== authority.publicationId ||
    certification.artifactId !== authority.artifactId ||
    certification.jobId !== authority.jobId ||
    certification.reportId !== authority.reportId ||
    certification.proofId !== authority.proofId ||
    certification.reportSha256 !== authority.reportSha256 ||
    certification.exactProofSha256 !== authority.proofSha256 ||
    certification.artifactPayloadSha256 !== authority.artifactPayloadSha256 ||
    canonicalizeReaderSummaryWeeklyJson(certification.providerCounts).json !==
      canonicalizeReaderSummaryWeeklyJson(authority.providerCounts).json
  ) {
    throw new Error(
      "Reader summary weekly historical daily certification authority is invalid",
    );
  }
  return deepFreezeReaderSummaryWeekly(certification);
};

const canonicalClone = <T>(value: T): T =>
  JSON.parse(canonicalizeReaderSummaryWeeklyJson(value).json) as T;

export const assertHistoricalSharedAuthority = (
  authority: ReaderSummaryWeeklyHistoricalPublicationAuthority,
  expected: Readonly<{
    requestedUtcDate: string;
    tenantId: string;
    workspaceId: string;
    scope: ReaderSummaryWeeklyManifestScope;
  }>,
): void => {
  if (
    authority.requestedUtcDate !== expected.requestedUtcDate ||
    authority.tenantId !== expected.tenantId ||
    authority.workspaceId !== expected.workspaceId ||
    readerSummaryWeeklyScopeKey(authority.scope) !==
      readerSummaryWeeklyScopeKey(expected.scope)
  ) {
    throw new Error(
      `Reader summary weekly day ${expected.requestedUtcDate} has mixed authority`,
    );
  }
};

const assertCanonicalDailyCertification = (
  certification: ReaderSummaryWeeklyCanonicalDailyCertification,
  githubAudit: ReaderSummaryWeeklyCanonicalInputDay["githubAudit"],
  expected: Readonly<{
    requestedUtcDate: string;
    tenantId: string;
    workspaceId: string;
    scope: ReaderSummaryWeeklyManifestScope;
  }>,
): void => {
  assertReaderSummaryWeeklyExactObject(
    certification,
    dailyCertificationKeys,
    `daily certification ${expected.requestedUtcDate}`,
    { allowAuthoritativeHashes: true },
  );
  if (
    certification.schemaVersion !==
      readerSummaryWeeklyDailyCertificationSchemaVersion ||
    certification.status !== "certified" ||
    certification.blockingPassed !== true
  ) {
    throw new Error(
      `Reader summary weekly day ${expected.requestedUtcDate} is not certified`,
    );
  }
  assertSharedAuthority(certification, expected);
  for (const field of uniqueDailyIdentityFields) {
    exactReaderSummaryWeeklyIdentity(
      certification[field],
      `daily certification ${field}`,
    );
  }
  for (const [value, label] of [
    [certification.reportSha256, "daily report hash"],
    [certification.exactProofSha256, "daily proof hash"],
    [certification.artifactPayloadSha256, "daily artifact hash"],
    [certification.githubAuditSha256, "daily GitHub audit hash"],
  ] as const) {
    exactReaderSummaryWeeklySha256(value, label);
  }
  assertReaderSummaryWeeklyDenseArray(
    certification.providerCounts,
    "daily certification provider counts",
  );
  if (
    certification.providerCounts.length !==
      readerSummaryWeeklyCanonicalProviderKeys.length
  ) {
    throw new Error(
      "Reader summary weekly daily certification provider counts are incomplete",
    );
  }
  certification.providerCounts.forEach((entry, index) => {
    assertReaderSummaryWeeklyExactObject(
      entry,
      ["providerKey", "count"],
      `daily certification provider count ${index + 1}`,
    );
    if (
      entry.providerKey !== readerSummaryWeeklyCanonicalProviderKeys[index] ||
      !Number.isSafeInteger(entry.count) ||
      entry.count < 0
    ) {
      throw new Error(
        "Reader summary weekly daily certification provider counts are invalid",
      );
    }
  });
  if (
    certification.providerCounts[0]?.count !==
      githubAudit.repositories.length ||
    certification.githubAuditSha256 !== githubAudit.sha256
  ) {
    throw new Error(
      "Reader summary weekly daily certification GitHub binding is invalid",
    );
  }
  const { identity, sha256, ...body } = certification;
  const expectedSha = canonicalizeReaderSummaryWeeklyJson(
    body,
    `daily certification ${expected.requestedUtcDate}`,
  ).sha256;
  if (
    exactReaderSummaryWeeklySha256(
      sha256,
      "daily certification hash",
    ) !== expectedSha ||
    identity !==
      `${readerSummaryWeeklyDailyCertificationSchemaVersion}:${expectedSha}`
  ) {
    throw new Error(
      "Reader summary weekly daily certification seal is invalid",
    );
  }
};

export const assertSharedAuthority = (
  day: ReaderSummaryWeeklyCanonicalDailyCertification,
  expected: Readonly<{
    requestedUtcDate: string;
    tenantId: string;
    workspaceId: string;
    scope: ReaderSummaryWeeklyManifestScope;
  }>,
): void => {
  const scope = canonicalReaderSummaryWeeklyScope(day.scope);
  if (
    day.requestedUtcDate !== expected.requestedUtcDate ||
    day.tenantId !== expected.tenantId ||
    day.workspaceId !== expected.workspaceId ||
    readerSummaryWeeklyScopeKey(scope) !==
      readerSummaryWeeklyScopeKey(expected.scope) ||
    day.blockingPassed !== true ||
    day.status !== "certified"
  ) {
    throw new Error(
      `Reader summary weekly day ${expected.requestedUtcDate} has mixed authority`,
    );
  }
};

export const assertUniqueCrossDayAuthorities = (
  days: readonly ReaderSummaryWeeklyCanonicalInputDay[],
): void => {
  assertUnique(
    days.map((day) => day.requestedUtcDate),
    "requested UTC dates",
  );
  assertUnique(
    days.map((day) => day.githubAudit.scanJobId),
    "GitHub scan job ids",
  );
  assertUnique(
    days.map((day) => day.githubAudit.identity),
    "GitHub audit identities",
  );
  assertUnique(
    days.map((day) => day.dailyCertification.identity),
    "daily certification identities",
  );
  for (const field of uniqueDailyIdentityFields) {
    assertUnique(
      days.map((day) => day.dailyCertification[field]),
      `${field} values`,
    );
  }
};

const assertUnique = (values: readonly unknown[], label: string): void => {
  if (new Set(values).size !== values.length) {
    throw new Error(`Reader summary weekly input manifest has duplicate ${label}`);
  }
};

export const utcDayAfter = (start: string, dayOffset: number): string =>
  new Date(
    Date.parse(`${start}T00:00:00.000Z`) + dayOffset * 86_400_000,
  ).toISOString().slice(0, 10);
