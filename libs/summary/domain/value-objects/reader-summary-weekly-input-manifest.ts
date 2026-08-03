import {
  assertReaderSummaryWeeklyDenseArray,
  assertReaderSummaryWeeklyExactObject,
  canonicalizeReaderSummaryWeeklyJson,
  canonicalReaderSummaryWeeklyScope,
  deepFreezeReaderSummaryWeekly,
  exactReaderSummaryWeeklyIdentity,
  exactReaderSummaryWeeklySha256,
  exactReaderSummaryWeeklyUtcDay,
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
import {
  type ReaderSummaryWeeklyCanonicalPublicationEvidence,
} from "./reader-summary-weekly-publication-evidence";
import {
  type ReaderSummaryWeeklyPublicationGitHubEvidence,
} from "./reader-summary-weekly-publication-github-evidence";
import {
  assertCanonicalInputDay,
  assertHistoricalSharedAuthority,
  assertSharedAuthority,
  assertUniqueCrossDayAuthorities,
  canonicalHistoricalAuthority,
  canonicalHistoricalDailyCertification,
  historicalGitHubAudit,
  readerSummaryWeeklyHistoricalGitHubDate,
  readerSummaryWeeklyInputManifestSchemaVersion,
  type readerSummaryWeeklyHistoricalGitHubAuthorizationIdentity,
  utcDayAfter,
} from "./reader-summary-weekly-input-manifest-canonical";

export {
  readerSummaryWeeklyHistoricalGitHubAuthorizationIdentity,
  readerSummaryWeeklyHistoricalGitHubDate,
  readerSummaryWeeklyInputManifestSchemaVersion,
} from "./reader-summary-weekly-input-manifest-canonical";

type ReaderSummaryWeeklyVerifiedInputDayEvidence = Readonly<{
  githubAuditEvidence: ReaderSummaryWeeklyGitHubAuditEvidenceInput;
  dailyCertificationEvidence: ReaderSummaryWeeklyDailyCertificationEvidenceInput;
}>;
type ReaderSummaryWeeklyHistoricalInputDayEvidence = Readonly<{
  historicalPublicationEvidence: ReaderSummaryWeeklyPersistedPublicationEvidence;
  historicalDailyCertification: ReaderSummaryWeeklyHistoricalDailyCertification;
  authorizationIdentity:
    typeof readerSummaryWeeklyHistoricalGitHubAuthorizationIdentity;
}>;
export type ReaderSummaryWeeklyInputDayEvidence =
  | ReaderSummaryWeeklyVerifiedInputDayEvidence
  | ReaderSummaryWeeklyHistoricalInputDayEvidence;
export type ReaderSummaryWeeklyInputManifestEvidence = Readonly<{
  weekStartedUtcDate: string;
  tenantId: string;
  workspaceId: string;
  scope: ReaderSummaryWeeklyManifestScope;
  days: readonly ReaderSummaryWeeklyInputDayEvidence[];
}>;
export type ReaderSummaryWeeklyHistoricalGitHubAudit =
  ReaderSummaryWeeklyPublicationGitHubEvidence &
    Readonly<{
      status: "historical_unavailable";
      authorizationIdentity:
        typeof readerSummaryWeeklyHistoricalGitHubAuthorizationIdentity;
      identity: string;
    }>;
export type ReaderSummaryWeeklyHistoricalDailyCertification =
  ReaderSummaryWeeklyCanonicalDailyCertification &
    Readonly<{
      requestedUtcDate: typeof readerSummaryWeeklyHistoricalGitHubDate;
    }>;
export type ReaderSummaryWeeklyPersistedPublicationEvidence = Omit<
  ReaderSummaryWeeklyCanonicalPublicationEvidence,
  "canonicalJson" | "byteLength" | "toBytes"
>;
export type ReaderSummaryWeeklyHistoricalPublicationAuthority =
  ReaderSummaryWeeklyPersistedPublicationEvidence &
  Readonly<{
    authorizationIdentity:
      typeof readerSummaryWeeklyHistoricalGitHubAuthorizationIdentity;
  }>;
type ReaderSummaryWeeklyCanonicalVerifiedInputDay = Readonly<{
  requestedUtcDate: string;
  githubAudit: ReaderSummaryWeeklyCanonicalGitHubAudit;
  dailyCertification: ReaderSummaryWeeklyCanonicalDailyCertification;
}>;
type ReaderSummaryWeeklyCanonicalHistoricalInputDay = Readonly<{
  requestedUtcDate: typeof readerSummaryWeeklyHistoricalGitHubDate;
  githubAudit: ReaderSummaryWeeklyHistoricalGitHubAudit;
  dailyCertification: ReaderSummaryWeeklyHistoricalDailyCertification;
  historicalAuthority: ReaderSummaryWeeklyHistoricalPublicationAuthority;
}>;
export type ReaderSummaryWeeklyCanonicalInputDay =
  | ReaderSummaryWeeklyCanonicalVerifiedInputDay
  | ReaderSummaryWeeklyCanonicalHistoricalInputDay;
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
const historicalDayKeys = [
  "historicalPublicationEvidence",
  "historicalDailyCertification",
  "authorizationIdentity",
] as const;
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
    const requestedUtcDate = utcDayAfter(weekStartedUtcDate, index);
    if ("historicalPublicationEvidence" in day) {
      assertReaderSummaryWeeklyExactObject(
        day,
        historicalDayKeys,
        `historical input day ${index + 1}`,
      );
      const historicalAuthority = canonicalHistoricalAuthority(
        day.historicalPublicationEvidence,
        day.authorizationIdentity,
      );
      assertHistoricalSharedAuthority(historicalAuthority, {
        requestedUtcDate,
        tenantId,
        workspaceId,
        scope,
      });
      const githubAudit = historicalGitHubAudit(historicalAuthority);
      const dailyCertification = canonicalHistoricalDailyCertification(
        day.historicalDailyCertification,
        historicalAuthority,
        githubAudit,
        { requestedUtcDate, tenantId, workspaceId, scope },
      );
      return deepFreezeReaderSummaryWeekly({
        requestedUtcDate: readerSummaryWeeklyHistoricalGitHubDate,
        githubAudit,
        dailyCertification,
        historicalAuthority,
      });
    }
    assertReaderSummaryWeeklyExactObject(day, dayKeys, `input day ${index + 1}`);
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
