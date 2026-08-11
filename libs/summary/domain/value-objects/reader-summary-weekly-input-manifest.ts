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
  certifyReaderSummaryWeeklyDailyEvidence,
  readerSummaryWeeklyCanonicalProviderKeys,
  readerSummaryWeeklyDailyCertificationSchemaVersion,
  type ReaderSummaryWeeklyCanonicalDailyCertification,
  type ReaderSummaryWeeklyDailyCertificationEvidenceInput,
} from "./reader-summary-weekly-daily-certification";
import {
  assertReaderSummaryWeeklyCanonicalGitHubAudit,
  certifyReaderSummaryWeeklyGitHubAudit,
  type ReaderSummaryWeeklyCanonicalGitHubAudit,
  type ReaderSummaryWeeklyGitHubAuditEvidenceInput,
} from "./reader-summary-weekly-github-audit";

export const readerSummaryWeeklyInputManifestSchemaVersion =
  "reader_summary.weekly_input_manifest.v1" as const;

export type ReaderSummaryWeeklyInputDayEvidence = Readonly<{
  githubAuditEvidence: ReaderSummaryWeeklyGitHubAuditEvidenceInput;
  dailyCertificationEvidence: ReaderSummaryWeeklyDailyCertificationEvidenceInput;
}>;
export type ReaderSummaryWeeklyInputManifestEvidence = Readonly<{
  weekStartedUtcDate: string;
  tenantId: string;
  workspaceId: string;
  scope: ReaderSummaryWeeklyManifestScope;
  days: readonly ReaderSummaryWeeklyInputDayEvidence[];
}>;
export type ReaderSummaryWeeklyCanonicalInputDay = Readonly<{
  requestedUtcDate: string;
  githubAudit: ReaderSummaryWeeklyCanonicalGitHubAudit;
  dailyCertification: ReaderSummaryWeeklyCanonicalDailyCertification;
}>;
export type ReaderSummaryWeeklySealedInputManifest = Readonly<{
  schemaVersion: typeof readerSummaryWeeklyInputManifestSchemaVersion;
  status: "sealed";
  blockingPassed: true;
  weekStartedUtcDate: string;
  weekEndedUtcDate: string;
  tenantId: string;
  workspaceId: string;
  scope: ReaderSummaryWeeklyManifestScope;
  days: readonly ReaderSummaryWeeklyCanonicalInputDay[];
  identity: string;
  sha256: string;
  canonicalJson: string;
  byteLength: number;
  toBytes(): Uint8Array;
}>;

const manifestKeys = [
  "weekStartedUtcDate",
  "tenantId",
  "workspaceId",
  "scope",
  "days",
] as const;
const dayKeys = ["githubAuditEvidence", "dailyCertificationEvidence"] as const;
const sealedManifestBodyKeys = [
  "schemaVersion",
  "status",
  "blockingPassed",
  "weekStartedUtcDate",
  "weekEndedUtcDate",
  "tenantId",
  "workspaceId",
  "scope",
  "days",
] as const;
const sealedManifestKeys = [
  ...sealedManifestBodyKeys,
  "identity",
  "sha256",
  "canonicalJson",
  "byteLength",
  "toBytes",
] as const;
const canonicalDayKeys = [
  "requestedUtcDate",
  "githubAudit",
  "dailyCertification",
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

export const sealReaderSummaryWeeklyInputManifest = (
  input: ReaderSummaryWeeklyInputManifestEvidence,
): ReaderSummaryWeeklySealedInputManifest => {
  canonicalizeReaderSummaryWeeklyJson(input, "input manifest evidence");
  assertReaderSummaryWeeklyExactObject(input, manifestKeys, "input manifest");
  const weekStartedUtcDate = exactReaderSummaryWeeklyUtcDay(
    input.weekStartedUtcDate,
  );
  if (new Date(`${weekStartedUtcDate}T00:00:00.000Z`).getUTCDay() !== 1) {
    throw new Error("Reader summary weekly input manifest must start on Monday");
  }
  const tenantId = exactReaderSummaryWeeklyIdentity(input.tenantId, "tenant id");
  const workspaceId = exactReaderSummaryWeeklyIdentity(
    input.workspaceId,
    "workspace id",
  );
  const scope = canonicalReaderSummaryWeeklyScope(input.scope);
  assertReaderSummaryWeeklyDenseArray(input.days, "input manifest days");
  if (input.days.length !== 7) {
    throw new Error("Reader summary weekly input manifest requires exact 7/7 days");
  }

  const days = input.days.map((day, index) => {
    assertReaderSummaryWeeklyExactObject(day, dayKeys, `input day ${index + 1}`);
    const requestedUtcDate = utcDayAfter(weekStartedUtcDate, index);
    const githubAudit = certifyReaderSummaryWeeklyGitHubAudit(
      day.githubAuditEvidence,
    );
    if (githubAudit.requestedUtcDay !== requestedUtcDate) {
      throw new Error(
        `Reader summary weekly GitHub audit does not bind ${requestedUtcDate}`,
      );
    }
    const dailyCertification = certifyReaderSummaryWeeklyDailyEvidence(
      day.dailyCertificationEvidence,
      githubAudit,
    );
    assertSharedAuthority(dailyCertification, {
      requestedUtcDate,
      tenantId,
      workspaceId,
      scope,
    });
    return deepFreezeReaderSummaryWeekly({
      requestedUtcDate,
      githubAudit,
      dailyCertification,
    });
  });
  assertUniqueCrossDayAuthorities(days);

  const body = deepFreezeReaderSummaryWeekly({
    schemaVersion: readerSummaryWeeklyInputManifestSchemaVersion,
    status: "sealed" as const,
    blockingPassed: true as const,
    weekStartedUtcDate,
    weekEndedUtcDate: utcDayAfter(weekStartedUtcDate, 6),
    tenantId,
    workspaceId,
    scope,
    days,
  });
  const seal = canonicalizeReaderSummaryWeeklyJson(body, "sealed input manifest");
  return deepFreezeReaderSummaryWeekly({
    ...body,
    identity: `${readerSummaryWeeklyInputManifestSchemaVersion}:${seal.sha256}`,
    sha256: seal.sha256,
    canonicalJson: seal.json,
    byteLength: seal.byteLength,
    toBytes: (): Uint8Array => seal.toBytes(),
  });
};

export function assertReaderSummaryWeeklySealedInputManifest(
  input: unknown,
): asserts input is ReaderSummaryWeeklySealedInputManifest {
  assertReaderSummaryWeeklyExactObject(
    input,
    sealedManifestKeys,
    "sealed input manifest",
    { allowAuthoritativeHashes: true },
  );
  const manifest = input as unknown as ReaderSummaryWeeklySealedInputManifest;
  if (typeof manifest.toBytes !== "function") {
    throw new Error(
      "Reader summary weekly sealed input manifest bytes are invalid",
    );
  }
  let suppliedBytes: unknown;
  try {
    suppliedBytes = manifest.toBytes();
  } catch {
    throw new Error(
      "Reader summary weekly sealed input manifest bytes are invalid",
    );
  }
  assertReaderSummaryWeeklyExactObject(
    manifest,
    sealedManifestKeys,
    "sealed input manifest",
    { allowAuthoritativeHashes: true },
  );
  if (
    manifest.schemaVersion !== readerSummaryWeeklyInputManifestSchemaVersion ||
    manifest.status !== "sealed" ||
    manifest.blockingPassed !== true
  ) {
    throw new Error("Reader summary weekly input manifest seal is invalid");
  }
  const weekStartedUtcDate = exactReaderSummaryWeeklyUtcDay(
    manifest.weekStartedUtcDate,
  );
  const weekEndedUtcDate = exactReaderSummaryWeeklyUtcDay(
    manifest.weekEndedUtcDate,
  );
  if (
    new Date(`${weekStartedUtcDate}T00:00:00.000Z`).getUTCDay() !== 1 ||
    weekEndedUtcDate !== utcDayAfter(weekStartedUtcDate, 6)
  ) {
    throw new Error(
      "Reader summary weekly sealed input manifest must be Monday-Sunday",
    );
  }
  const authority = {
    tenantId: exactReaderSummaryWeeklyIdentity(
      manifest.tenantId,
      "tenant id",
    ),
    workspaceId: exactReaderSummaryWeeklyIdentity(
      manifest.workspaceId,
      "workspace id",
    ),
    scope: canonicalReaderSummaryWeeklyScope(manifest.scope),
  };
  assertReaderSummaryWeeklyDenseArray(
    manifest.days,
    "sealed input manifest days",
  );
  if (manifest.days.length !== 7) {
    throw new Error("Reader summary weekly input manifest requires exact 7/7 days");
  }
  manifest.days.forEach((day, index) => {
    assertCanonicalInputDay(
      day,
      utcDayAfter(weekStartedUtcDate, index),
      authority,
    );
  });
  assertUniqueCrossDayAuthorities(manifest.days);

  const body = Object.fromEntries(
    sealedManifestBodyKeys.map((key) => [key, manifest[key]]),
  );
  const canonical = canonicalizeReaderSummaryWeeklyJson(
    body,
    "sealed input manifest body",
  );
  const sha256 = exactReaderSummaryWeeklySha256(
    manifest.sha256,
    "input manifest hash",
  );
  if (
    sha256 !== canonical.sha256 ||
    manifest.identity !==
      `${readerSummaryWeeklyInputManifestSchemaVersion}:${canonical.sha256}` ||
    manifest.canonicalJson !== canonical.json ||
    manifest.byteLength !== canonical.byteLength ||
    !(suppliedBytes instanceof Uint8Array) ||
    Buffer.from(suppliedBytes).compare(Buffer.from(canonical.toBytes())) !== 0
  ) {
    throw new Error("Reader summary weekly input manifest seal is invalid");
  }
}

const assertCanonicalInputDay = (
  day: ReaderSummaryWeeklyCanonicalInputDay,
  requestedUtcDate: string,
  authority: Readonly<{
    tenantId: string;
    workspaceId: string;
    scope: ReaderSummaryWeeklyManifestScope;
  }>,
): void => {
  assertReaderSummaryWeeklyExactObject(
    day,
    canonicalDayKeys,
    `sealed input day ${requestedUtcDate}`,
  );
  if (
    exactReaderSummaryWeeklyUtcDay(day.requestedUtcDate) !== requestedUtcDate
  ) {
    throw new Error(
      `Reader summary weekly sealed input day does not bind ${requestedUtcDate}`,
    );
  }
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

const assertCanonicalDailyCertification = (
  certification: ReaderSummaryWeeklyCanonicalDailyCertification,
  githubAudit: ReaderSummaryWeeklyCanonicalGitHubAudit,
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

const assertSharedAuthority = (
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

const assertUniqueCrossDayAuthorities = (
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

const assertUnique = (values: readonly string[], label: string): void => {
  if (new Set(values).size !== values.length) {
    throw new Error(`Reader summary weekly input manifest has duplicate ${label}`);
  }
};

const utcDayAfter = (start: string, dayOffset: number): string =>
  new Date(
    Date.parse(`${start}T00:00:00.000Z`) + dayOffset * 86_400_000,
  ).toISOString().slice(0, 10);
