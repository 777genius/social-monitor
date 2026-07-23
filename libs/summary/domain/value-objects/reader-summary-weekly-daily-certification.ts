import {
  assertReaderSummaryWeeklyDailyPeriod,
  assertReaderSummaryWeeklyDenseArray,
  assertReaderSummaryWeeklyExactObject,
  canonicalizeReaderSummaryWeeklyJson,
  canonicalReaderSummaryWeeklyScope,
  deepFreezeReaderSummaryWeekly,
  exactReaderSummaryWeeklyIdentity,
  exactReaderSummaryWeeklySha256,
  exactReaderSummaryWeeklyUtcDay,
  exactReaderSummaryWeeklyUtcTimestamp,
  readerSummaryWeeklyScopeKey,
  type ReaderSummaryWeeklyDailyPeriod,
  type ReaderSummaryWeeklyManifestScope,
} from "./reader-summary-weekly-canonical-json";
import {
  assertReaderSummaryWeeklyCanonicalGitHubAudit,
  readerSummaryWeeklyGitHubProviderKey,
  type ReaderSummaryWeeklyCanonicalGitHubAudit,
  type readerSummaryWeeklyGitHubEvidenceKind,
} from "./reader-summary-weekly-github-audit";
export const readerSummaryWeeklyDailyCertificationSchemaVersion = "reader_summary.weekly_daily_certification.v1" as const;
export const readerSummaryWeeklyDailyReportSchemaVersion = "reader_summary.weekly_daily_report.v1" as const;
export const readerSummaryWeeklyDailyProofSchemaVersion = "reader_summary.weekly_daily_proof.v1" as const;
export const readerSummaryWeeklyDailyArtifactSchemaVersion = "reader_summary.weekly_daily_artifact.v1" as const;
export const readerSummaryWeeklyProviderSourceEvidenceSchemaVersion = "reader_summary.weekly_provider_source_evidence.v1" as const;
export const readerSummaryWeeklyCanonicalProviderKeys = [
  "github-trending-page", "hacker-news", "reddit", "rss", "x-twitter",
] as const;
export type ReaderSummaryWeeklyCanonicalProviderKey =
  (typeof readerSummaryWeeklyCanonicalProviderKeys)[number];
type GenericProviderKey = Exclude<
  ReaderSummaryWeeklyCanonicalProviderKey,
  typeof readerSummaryWeeklyGitHubProviderKey>;
export const readerSummaryWeeklyRequiredDailyBlockingGateNames = [
  "artifactBinding", "githubBoardBinding", "providerEvidenceBinding",
  "publicationBinding", "reportProofBinding", "utcDayBinding",
] as const;
export type ReaderSummaryWeeklyDailyBlockingGateName =
  (typeof readerSummaryWeeklyRequiredDailyBlockingGateNames)[number];
export type ReaderSummaryWeeklyGitHubBindingInput = Readonly<{
  requestedUtcDay: string; scanJobId: string;
  providerKey: typeof readerSummaryWeeklyGitHubProviderKey;
  kind: typeof readerSummaryWeeklyGitHubEvidenceKind;
  sourceBindingId: string;
}>;
export type ReaderSummaryWeeklyProviderSourceEvidenceInput = Readonly<{
  sourceRecordId: string; observedAt: string; title: string; content: string;
}>;
type ProviderEvidenceAuthority = Readonly<{
  evidenceId: string; sourceBindingId: string;
}>;
export type ReaderSummaryWeeklyProviderEvidenceInput =
  | ProviderEvidenceAuthority & Readonly<{
      providerKey: typeof readerSummaryWeeklyGitHubProviderKey;
      repositoryIdentity: string;
    }>
  | ProviderEvidenceAuthority & Readonly<{
      providerKey: GenericProviderKey;
      sourceEvidence: ReaderSummaryWeeklyProviderSourceEvidenceInput;
    }>;
type DailyAuthority = Readonly<{
  requestedUtcDate: string; tenantId: string; workspaceId: string;
  scope: ReaderSummaryWeeklyManifestScope;
  publicationId: string; artifactId: string; jobId: string;
  reportId: string; proofId: string;
}>;
type DailyAuthorityInput = DailyAuthority & Readonly<{
  period: ReaderSummaryWeeklyDailyPeriod;
}>;
export type ReaderSummaryWeeklyDailyArtifactPayloadInput = Readonly<
  DailyAuthorityInput & {
    schemaVersion: typeof readerSummaryWeeklyDailyArtifactSchemaVersion;
    githubBinding: ReaderSummaryWeeklyGitHubBindingInput;
    providerEvidence: readonly ReaderSummaryWeeklyProviderEvidenceInput[];
  }
>;
export type ReaderSummaryWeeklyProviderCountsInput = Readonly<
  Record<ReaderSummaryWeeklyCanonicalProviderKey, number>
>;
type ReportAuthority = Pick<
  DailyAuthority,
  "requestedUtcDate" | "tenantId" | "workspaceId" | "scope" |
  "publicationId" | "reportId"
>;
export type ReaderSummaryWeeklyDailyReportPayloadInput = Readonly<
  ReportAuthority & {
  schemaVersion: typeof readerSummaryWeeklyDailyReportSchemaVersion;
  period: ReaderSummaryWeeklyDailyPeriod;
  artifactBinding: Readonly<{
    artifactId: string; jobId: string; proofId: string; artifactSha256: string;
  }>;
  githubBinding: ReaderSummaryWeeklyGitHubBindingInput;
  providerCounts: ReaderSummaryWeeklyProviderCountsInput;
  blockingGates: Readonly<
    Record<ReaderSummaryWeeklyDailyBlockingGateName, boolean>
  >;
}>;
export type ReaderSummaryWeeklyDailyExactProofInput = Readonly<
  DailyAuthorityInput & {
    schemaVersion: typeof readerSummaryWeeklyDailyProofSchemaVersion;
    reportSha256: string; artifactSha256: string;
    githubBinding: ReaderSummaryWeeklyGitHubBindingInput;
    providerCounts: ReaderSummaryWeeklyProviderCountsInput;
    blockingGateNames: readonly ReaderSummaryWeeklyDailyBlockingGateName[];
  }
>;
export type ReaderSummaryWeeklyDailyCertificationEvidenceInput = Readonly<
  DailyAuthority & {
  reportPayload: ReaderSummaryWeeklyDailyReportPayloadInput;
  exactProof: ReaderSummaryWeeklyDailyExactProofInput;
  artifactPayload: ReaderSummaryWeeklyDailyArtifactPayloadInput;
}>;
export type ReaderSummaryWeeklyCanonicalProviderCount = Readonly<{
  providerKey: ReaderSummaryWeeklyCanonicalProviderKey; count: number;
}>;
export type ReaderSummaryWeeklyCanonicalDailyCertification = Readonly<
  DailyAuthority & {
  schemaVersion: typeof readerSummaryWeeklyDailyCertificationSchemaVersion;
  status: "certified"; blockingPassed: true;
  reportSha256: string; exactProofSha256: string; artifactPayloadSha256: string;
  providerCounts: readonly ReaderSummaryWeeklyCanonicalProviderCount[];
  githubAuditSha256: string; identity: string; sha256: string;
}>;
type CertifiedProviderEvidence = Readonly<{
  evidenceId: string; providerKey: ReaderSummaryWeeklyCanonicalProviderKey;
  sourceIdentity: string; sourceContentHash: string; canonicalOrder: string;
}>;
const evidenceKeys = [
  "requestedUtcDate", "tenantId", "workspaceId", "scope", "publicationId",
  "artifactId", "jobId", "reportId", "proofId", "reportPayload", "exactProof",
  "artifactPayload",
] as const;
const authorityKeys = [
  "requestedUtcDate", "tenantId", "workspaceId", "scope", "period",
  "publicationId", "artifactId", "jobId", "reportId", "proofId",
] as const;
const artifactKeys = [
  "schemaVersion", ...authorityKeys, "githubBinding", "providerEvidence",
] as const;
const reportKeys = [
  "schemaVersion", "requestedUtcDate", "tenantId", "workspaceId", "scope",
  "period", "publicationId", "reportId", "artifactBinding", "githubBinding",
  "providerCounts", "blockingGates",
] as const;
const proofKeys = ["schemaVersion", ...authorityKeys, "reportSha256",
  "artifactSha256", "githubBinding", "providerCounts", "blockingGateNames"] as const;
const githubBindingKeys = ["requestedUtcDay", "scanJobId", "providerKey",
  "kind", "sourceBindingId"] as const;
export const certifyReaderSummaryWeeklyDailyEvidence = (
  input: ReaderSummaryWeeklyDailyCertificationEvidenceInput,
  githubAudit: ReaderSummaryWeeklyCanonicalGitHubAudit,
): ReaderSummaryWeeklyCanonicalDailyCertification => {
  canonicalizeReaderSummaryWeeklyJson(input, "daily certification evidence");
  assertReaderSummaryWeeklyExactObject(input, evidenceKeys, "daily evidence");
  assertReaderSummaryWeeklyCanonicalGitHubAudit(githubAudit);
  const authority = readAuthority(input);
  const artifact = validateArtifact(input.artifactPayload, authority, githubAudit);
  const reportHash = validateReport(
    input.reportPayload, authority, githubAudit, artifact.hash);
  validateProof(
    input.exactProof, authority, githubAudit, reportHash, artifact.hash,
    artifact.providerCounts);
  assertProviderCounts(
    input.reportPayload.providerCounts, artifact.providerCounts, "daily report");
  const body = deepFreezeReaderSummaryWeekly({
    schemaVersion: readerSummaryWeeklyDailyCertificationSchemaVersion,
    status: "certified" as const,
    blockingPassed: true as const,
    ...authority,
    reportSha256: reportHash,
    exactProofSha256: canonicalizeReaderSummaryWeeklyJson(
      input.exactProof, "daily exact proof").sha256,
    artifactPayloadSha256: artifact.hash,
    providerCounts: artifact.providerCounts,
    githubAuditSha256: githubAudit.sha256,
  });
  const hash = canonicalizeReaderSummaryWeeklyJson(
    body, `daily certification ${authority.requestedUtcDate}`).sha256;
  return deepFreezeReaderSummaryWeekly({
    ...body,
    identity: `${readerSummaryWeeklyDailyCertificationSchemaVersion}:${hash}`,
    sha256: hash,
  });
};
const readAuthority = (
  input: ReaderSummaryWeeklyDailyCertificationEvidenceInput,
): DailyAuthority => deepFreezeReaderSummaryWeekly({
  requestedUtcDate: exactReaderSummaryWeeklyUtcDay(input.requestedUtcDate),
  tenantId: exactReaderSummaryWeeklyIdentity(input.tenantId, "tenant id"),
  workspaceId: exactReaderSummaryWeeklyIdentity(input.workspaceId, "workspace id"),
  scope: canonicalReaderSummaryWeeklyScope(input.scope),
  publicationId: exactReaderSummaryWeeklyIdentity(input.publicationId, "publication id"),
  artifactId: exactReaderSummaryWeeklyIdentity(input.artifactId, "artifact id"),
  jobId: exactReaderSummaryWeeklyIdentity(input.jobId, "job id"),
  reportId: exactReaderSummaryWeeklyIdentity(input.reportId, "report id"),
  proofId: exactReaderSummaryWeeklyIdentity(input.proofId, "proof id"),
});
const validateArtifact = (
  artifact: ReaderSummaryWeeklyDailyArtifactPayloadInput,
  authority: DailyAuthority,
  audit: ReaderSummaryWeeklyCanonicalGitHubAudit,
): Readonly<{
  hash: string;
  providerCounts: readonly ReaderSummaryWeeklyCanonicalProviderCount[];
}> => {
  assertReaderSummaryWeeklyExactObject(artifact, artifactKeys, "daily artifact");
  if (artifact.schemaVersion !== readerSummaryWeeklyDailyArtifactSchemaVersion) {
    throw new Error("Reader summary weekly daily artifact schema is invalid");
  }
  assertAuthorityBinding(artifact, authority, "daily artifact");
  assertGitHubBinding(artifact.githubBinding, audit, "daily artifact");
  assertReaderSummaryWeeklyDenseArray(
    artifact.providerEvidence, "daily artifact provider evidence");
  const evidence = artifact.providerEvidence.map((item) =>
    certifyProviderEvidence(item, authority.requestedUtcDate, audit),
  );
  assertUnique(evidence.map((item) => item.evidenceId), "provider evidence ids");
  assertUnique(evidence.map(
    (item) => `${item.providerKey}:${item.sourceIdentity}`),
  "provider source identities");
  assertUnique(evidence.map(
    (item) => `${item.providerKey}:${item.sourceContentHash}`),
  "provider source content");
  assertCanonicalProviderOrder(evidence);
  const providerCounts = deriveProviderCounts(evidence, audit);
  return deepFreezeReaderSummaryWeekly({
    hash: canonicalizeReaderSummaryWeeklyJson(
      artifact, "daily artifact payload").sha256,
    providerCounts,
  });
};
const certifyProviderEvidence = (
  input: ReaderSummaryWeeklyProviderEvidenceInput,
  requestedUtcDate: string,
  audit: ReaderSummaryWeeklyCanonicalGitHubAudit,
): CertifiedProviderEvidence => {
  const evidenceId = exactReaderSummaryWeeklyIdentity(
    input.evidenceId, "provider evidence id");
  const sourceBindingId = exactReaderSummaryWeeklyIdentity(
    input.sourceBindingId, "provider source binding id");
  if (input.providerKey === readerSummaryWeeklyGitHubProviderKey) {
    assertReaderSummaryWeeklyExactObject(input,
      ["evidenceId", "providerKey", "sourceBindingId", "repositoryIdentity"],
      "GitHub daily provider evidence");
    const repository = audit.repositories.find(
      (item) => item.repositoryIdentity === input.repositoryIdentity,
    );
    if (sourceBindingId !== audit.sourceBindingId || repository === undefined) {
      throw new Error("Reader summary weekly provider evidence misses GitHub board");
    }
    return deepFreezeReaderSummaryWeekly({
      evidenceId,
      providerKey: input.providerKey,
      sourceIdentity: repository.repositoryIdentity,
      sourceContentHash: repository.sourceContentHash,
      canonicalOrder: `0:${String(repository.rank).padStart(2, "0")}`,
    });
  }
  assertReaderSummaryWeeklyExactObject(input,
    ["evidenceId", "providerKey", "sourceBindingId", "sourceEvidence"],
    "generic daily provider evidence");
  assertGenericProviderKey(input.providerKey);
  const source = canonicalGenericSourceEvidence(
    input.sourceEvidence, requestedUtcDate);
  const sourceContentHash = canonicalizeReaderSummaryWeeklyJson({
    schemaVersion: readerSummaryWeeklyProviderSourceEvidenceSchemaVersion,
    providerKey: input.providerKey,
    sourceBindingId,
    ...source,
  }, "generic daily provider source evidence").sha256;
  const providerOrder = readerSummaryWeeklyCanonicalProviderKeys.indexOf(
    input.providerKey);
  return deepFreezeReaderSummaryWeekly({
    evidenceId,
    providerKey: input.providerKey,
    sourceIdentity: source.sourceRecordId,
    sourceContentHash,
    canonicalOrder: `${providerOrder}:${source.sourceRecordId}`,
  });
};
const canonicalGenericSourceEvidence = (
  input: ReaderSummaryWeeklyProviderSourceEvidenceInput,
  requestedUtcDate: string,
): ReaderSummaryWeeklyProviderSourceEvidenceInput => {
  assertReaderSummaryWeeklyExactObject(input,
    ["sourceRecordId", "observedAt", "title", "content"],
    "generic provider source evidence");
  const observedAt = exactReaderSummaryWeeklyUtcTimestamp(
    input.observedAt, "generic provider observedAt");
  const start = Date.parse(`${requestedUtcDate}T00:00:00.000Z`);
  if (Date.parse(observedAt) < start || Date.parse(observedAt) >= start + 86_400_000) {
    throw new Error("Reader summary weekly generic provider evidence is outside its UTC day");
  }
  if (
    typeof input.content !== "string" ||
    input.content.length === 0 ||
    input.content.length > 16_384 ||
    input.content.includes("\0")
  ) {
    throw new Error("Reader summary weekly generic provider content is invalid");
  }
  return deepFreezeReaderSummaryWeekly({
    sourceRecordId: exactReaderSummaryWeeklyIdentity(
      input.sourceRecordId, "generic provider source record id"),
    observedAt,
    title: exactReaderSummaryWeeklyIdentity(input.title, "generic provider title"),
    content: input.content,
  });
};
const validateReport = (
  report: ReaderSummaryWeeklyDailyReportPayloadInput,
  authority: DailyAuthority,
  audit: ReaderSummaryWeeklyCanonicalGitHubAudit,
  artifactHash: string,
): string => {
  assertReaderSummaryWeeklyExactObject(report, reportKeys, "daily report");
  if (report.schemaVersion !== readerSummaryWeeklyDailyReportSchemaVersion) {
    throw new Error("Reader summary weekly daily report schema is invalid");
  }
  assertReportAuthorityBinding(report, authority);
  assertGitHubBinding(report.githubBinding, audit, "daily report");
  assertReaderSummaryWeeklyExactObject(report.artifactBinding,
    ["artifactId", "jobId", "proofId", "artifactSha256"],
    "daily report artifact binding", { allowAuthoritativeHashes: true });
  if (
    report.artifactBinding.artifactId !== authority.artifactId ||
    report.artifactBinding.jobId !== authority.jobId ||
    report.artifactBinding.proofId !== authority.proofId ||
    exactReaderSummaryWeeklySha256(report.artifactBinding.artifactSha256,
      "report artifact hash") !== artifactHash
  ) {
    throw new Error("Reader summary weekly report artifact binding is invalid");
  }
  assertBlockingGates(report.blockingGates);
  return canonicalizeReaderSummaryWeeklyJson(report, "daily report payload").sha256;
};
const validateProof = (
  proof: ReaderSummaryWeeklyDailyExactProofInput,
  authority: DailyAuthority,
  audit: ReaderSummaryWeeklyCanonicalGitHubAudit,
  reportHash: string,
  artifactHash: string,
  providerCounts: readonly ReaderSummaryWeeklyCanonicalProviderCount[],
): void => {
  assertReaderSummaryWeeklyExactObject(proof, proofKeys, "daily exact proof",
    { allowAuthoritativeHashes: true });
  if (proof.schemaVersion !== readerSummaryWeeklyDailyProofSchemaVersion) {
    throw new Error("Reader summary weekly daily proof schema is invalid");
  }
  assertAuthorityBinding(proof, authority, "daily exact proof");
  assertGitHubBinding(proof.githubBinding, audit, "daily exact proof");
  if (
    exactReaderSummaryWeeklySha256(proof.reportSha256, "proof report hash") !==
      reportHash ||
    exactReaderSummaryWeeklySha256(proof.artifactSha256, "proof artifact hash") !==
      artifactHash
  ) {
    throw new Error("Reader summary weekly proof hashes are invalid");
  }
  assertProviderCounts(
    proof.providerCounts, providerCounts, "daily exact proof");
  assertReaderSummaryWeeklyDenseArray(proof.blockingGateNames, "proof gate names");
  if (
    proof.blockingGateNames.length !==
      readerSummaryWeeklyRequiredDailyBlockingGateNames.length ||
    proof.blockingGateNames.some((name, index) =>
      name !== readerSummaryWeeklyRequiredDailyBlockingGateNames[index])
  ) {
    throw new Error("Reader summary weekly proof gate names are not canonical");
  }
};
const assertAuthorityBinding = (
  input: DailyAuthorityInput,
  authority: DailyAuthority,
  label: string,
): void => {
  assertReaderSummaryWeeklyDailyPeriod(
    input.period, authority.requestedUtcDate, label);
  const scope = canonicalReaderSummaryWeeklyScope(input.scope);
  if (
    input.requestedUtcDate !== authority.requestedUtcDate ||
    input.tenantId !== authority.tenantId ||
    input.workspaceId !== authority.workspaceId ||
    readerSummaryWeeklyScopeKey(scope) !== readerSummaryWeeklyScopeKey(authority.scope) ||
    input.publicationId !== authority.publicationId ||
    input.artifactId !== authority.artifactId ||
    input.jobId !== authority.jobId ||
    input.reportId !== authority.reportId ||
    input.proofId !== authority.proofId
  ) {
    throw new Error(`Reader summary weekly ${label} authority is invalid`);
  }
};
const assertReportAuthorityBinding = (
  report: ReaderSummaryWeeklyDailyReportPayloadInput,
  authority: DailyAuthority,
): void => {
  assertReaderSummaryWeeklyDailyPeriod(
    report.period, authority.requestedUtcDate, "daily report");
  if (
    report.requestedUtcDate !== authority.requestedUtcDate ||
    report.tenantId !== authority.tenantId ||
    report.workspaceId !== authority.workspaceId ||
    readerSummaryWeeklyScopeKey(canonicalReaderSummaryWeeklyScope(report.scope)) !==
      readerSummaryWeeklyScopeKey(authority.scope) ||
    report.publicationId !== authority.publicationId ||
    report.reportId !== authority.reportId
  ) {
    throw new Error("Reader summary weekly daily report authority is invalid");
  }
};
const assertGitHubBinding = (
  binding: ReaderSummaryWeeklyGitHubBindingInput,
  audit: ReaderSummaryWeeklyCanonicalGitHubAudit,
  label: string,
): void => {
  assertReaderSummaryWeeklyExactObject(
    binding, githubBindingKeys, `${label} GitHub binding`);
  if (
    binding.requestedUtcDay !== audit.requestedUtcDay ||
    binding.scanJobId !== audit.scanJobId ||
    binding.providerKey !== audit.providerKey ||
    binding.kind !== audit.kind ||
    binding.sourceBindingId !== audit.sourceBindingId
  ) {
    throw new Error(`Reader summary weekly ${label} GitHub binding is invalid`);
  }
};
const deriveProviderCounts = (
  evidence: readonly CertifiedProviderEvidence[],
  audit: ReaderSummaryWeeklyCanonicalGitHubAudit,
): readonly ReaderSummaryWeeklyCanonicalProviderCount[] => {
  const github = evidence.filter(
    (item) => item.providerKey === readerSummaryWeeklyGitHubProviderKey);
  if (
    github.length !== audit.repositories.length ||
    github.some((item, index) =>
      item.sourceIdentity !== audit.repositories[index]!.repositoryIdentity ||
      item.sourceContentHash !== audit.repositories[index]!.sourceContentHash)
  ) {
    throw new Error("Reader summary weekly provider evidence misses GitHub board");
  }
  return deepFreezeReaderSummaryWeekly(
    readerSummaryWeeklyCanonicalProviderKeys.map((providerKey) => ({
      providerKey,
      count: evidence.filter((item) => item.providerKey === providerKey).length,
    })),
  );
};
const assertCanonicalProviderOrder = (
  evidence: readonly CertifiedProviderEvidence[],
): void => {
  const order = evidence.map((item) => item.canonicalOrder);
  if (order.some((value, index) => value !== [...order].sort()[index])) {
    throw new Error("Reader summary weekly provider evidence order is not canonical");
  }
};
const assertProviderCounts = (
  input: ReaderSummaryWeeklyProviderCountsInput,
  expected: readonly ReaderSummaryWeeklyCanonicalProviderCount[],
  label: string,
): void => {
  assertReaderSummaryWeeklyExactObject(
    input, readerSummaryWeeklyCanonicalProviderKeys, `${label} provider counts`);
  if (expected.some(({ providerKey, count }) =>
    !Number.isSafeInteger(input[providerKey]) ||
    input[providerKey] < 0 ||
    input[providerKey] !== count
  )) {
    throw new Error(`Reader summary weekly ${label} provider counts are invalid`);
  }
};
const assertBlockingGates = (
  input: Readonly<Record<ReaderSummaryWeeklyDailyBlockingGateName, boolean>>,
): void => {
  assertReaderSummaryWeeklyExactObject(input,
    readerSummaryWeeklyRequiredDailyBlockingGateNames,
    "daily report blocking gates");
  if (readerSummaryWeeklyRequiredDailyBlockingGateNames.some(
    (name) => input[name] !== true)) {
    throw new Error("Reader summary weekly daily report has a failing gate");
  }
};
function assertGenericProviderKey(
  value: unknown,
): asserts value is GenericProviderKey {
  if (
    !readerSummaryWeeklyCanonicalProviderKeys.includes(
      value as ReaderSummaryWeeklyCanonicalProviderKey) ||
    value === readerSummaryWeeklyGitHubProviderKey
  ) {
    throw new Error("Reader summary weekly generic provider key is invalid");
  }
}
const assertUnique = (values: readonly string[], label: string): void => {
  if (new Set(values).size !== values.length) {
    throw new Error(`Reader summary weekly has duplicate ${label}`); }
};
