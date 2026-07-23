import {
  assertReaderSummaryWeeklyDenseArray,
  assertReaderSummaryWeeklyExactObject,
  canonicalizeReaderSummaryWeeklyJson,
  canonicalReaderSummaryWeeklyScope,
  deepFreezeReaderSummaryWeekly,
  exactReaderSummaryWeeklyIdentity,
  exactReaderSummaryWeeklyUtcDay,
  readerSummaryWeeklyScopeKey,
  type ReaderSummaryWeeklyManifestScope,
} from "./reader-summary-weekly-canonical-json";
import {
  certifyReaderSummaryWeeklyDailyEvidence,
  type ReaderSummaryWeeklyCanonicalDailyCertification,
  type ReaderSummaryWeeklyDailyCertificationEvidenceInput,
} from "./reader-summary-weekly-daily-certification";
import {
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

const assertSharedAuthority = (
  day: ReaderSummaryWeeklyCanonicalDailyCertification,
  expected: Readonly<{
    requestedUtcDate: string;
    tenantId: string;
    workspaceId: string;
    scope: ReaderSummaryWeeklyManifestScope;
  }>,
): void => {
  if (
    day.requestedUtcDate !== expected.requestedUtcDate ||
    day.tenantId !== expected.tenantId ||
    day.workspaceId !== expected.workspaceId ||
    readerSummaryWeeklyScopeKey(day.scope) !==
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
