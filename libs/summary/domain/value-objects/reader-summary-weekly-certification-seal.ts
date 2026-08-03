import {
  assertReaderSummaryWeeklyDenseArray,
  assertReaderSummaryWeeklyExactObject,
  canonicalizeReaderSummaryWeeklyJson,
  deepFreezeReaderSummaryWeekly,
  exactReaderSummaryWeeklyIdentity,
  exactReaderSummaryWeeklySha256,
  exactReaderSummaryWeeklyUtcDay,
  type ReaderSummaryWeeklyManifestScope,
} from "./reader-summary-weekly-canonical-json";
import { readerSummaryWeeklyPublicationEvidenceSchemaVersion } from "./reader-summary-weekly-publication-evidence";

export const readerSummaryWeeklyCertificationSealSchemaVersion =
  "reader_summary.weekly_certification_seal.v1" as const;

export type ReaderSummaryWeeklyCertificationSealDay = Readonly<{
  requestedUtcDate: string;
  publicationId: string;
  artifactId: string;
  jobId: string;
  semanticStatus: "COMPLETED" | "NO_SIGNAL";
  publicationEvidenceIdentity: string;
  publicationEvidenceSha256: string;
}>;

export type ReaderSummaryWeeklyCertificationSealBinding = Readonly<{
  schemaVersion: typeof readerSummaryWeeklyCertificationSealSchemaVersion;
  tenantId: string;
  workspaceId: string;
  scopeType: "workspace" | "interest";
  scopeKey: string;
  weekStartedOn: string;
  weekEndedOn: string;
  days: readonly ReaderSummaryWeeklyCertificationSealDay[];
  sealId: string;
  sealSha: string;
}>;

const sealKeys = [
  "schemaVersion", "tenantId", "workspaceId", "scopeType", "scopeKey",
  "weekStartedOn", "weekEndedOn", "days", "sealId", "sealSha",
] as const;
const dayKeys = [
  "requestedUtcDate", "publicationId", "artifactId", "jobId",
  "semanticStatus", "publicationEvidenceIdentity",
  "publicationEvidenceSha256",
] as const;

export const readerSummaryWeeklyCertificationSealScope = (
  seal: ReaderSummaryWeeklyCertificationSealBinding,
): ReaderSummaryWeeklyManifestScope =>
  seal.scopeType === "workspace"
    ? Object.freeze({ type: "workspace" as const })
    : Object.freeze({
        type: "interest" as const,
        interestId: seal.scopeKey.slice("interest:".length),
      });

export function assertReaderSummaryWeeklyCertificationSealBinding(
  input: unknown,
): asserts input is ReaderSummaryWeeklyCertificationSealBinding {
  assertReaderSummaryWeeklyExactObject(
    input,
    sealKeys,
    "weekly certification seal",
    { allowAuthoritativeHashes: true },
  );
  const seal = input as ReaderSummaryWeeklyCertificationSealBinding;
  const tenantId = exactReaderSummaryWeeklyIdentity(seal.tenantId, "seal tenant id");
  const workspaceId = exactReaderSummaryWeeklyIdentity(
    seal.workspaceId,
    "seal workspace id",
  );
  const weekStartedOn = exactReaderSummaryWeeklyUtcDay(seal.weekStartedOn);
  const weekEndedOn = exactReaderSummaryWeeklyUtcDay(seal.weekEndedOn);
  if (
    new Date(`${weekStartedOn}T00:00:00.000Z`).getUTCDay() !== 1 ||
    weekEndedOn !== utcDayAfter(weekStartedOn, 6)
  ) {
    throw new Error("Reader summary weekly certification seal must be Monday-Sunday");
  }
  assertReaderSummaryWeeklyDenseArray(seal.days, "weekly certification seal days");
  if (seal.days.length !== 7) {
    throw new Error("Reader summary weekly certification seal requires exact 7/7 days");
  }
  const days = seal.days.map((day, index) => canonicalDay(day, weekStartedOn, index));
  assertUnique(days.map((day) => day.requestedUtcDate), "dates");
  assertUnique(days.map((day) => day.publicationId), "publication ids");
  assertUnique(
    days.map((day) => day.publicationEvidenceIdentity),
    "publication evidence identities",
  );
  const scopeKey = exactScope(seal.scopeType, seal.scopeKey);
  const body = {
    schemaVersion: readerSummaryWeeklyCertificationSealSchemaVersion,
    tenantId,
    workspaceId,
    scopeType: seal.scopeType,
    scopeKey,
    weekStartedOn,
    weekEndedOn,
    days,
  };
  const canonical = canonicalizeReaderSummaryWeeklyJson(
    body,
    "weekly certification seal body",
  );
  const sealSha = exactReaderSummaryWeeklySha256(
    seal.sealSha,
    "weekly certification seal hash",
  );
  if (
    seal.schemaVersion !== readerSummaryWeeklyCertificationSealSchemaVersion ||
    canonical.sha256 !== sealSha ||
    seal.sealId !== `${readerSummaryWeeklyCertificationSealSchemaVersion}:${sealSha}` ||
    canonicalizeReaderSummaryWeeklyJson(seal.days).json !==
      canonicalizeReaderSummaryWeeklyJson(days).json
  ) {
    throw new Error("Reader summary weekly certification seal identity is invalid");
  }
}

export const cloneReaderSummaryWeeklyCertificationSealBinding = (
  seal: ReaderSummaryWeeklyCertificationSealBinding,
): ReaderSummaryWeeklyCertificationSealBinding => {
  assertReaderSummaryWeeklyCertificationSealBinding(seal);
  return deepFreezeReaderSummaryWeekly({
    ...seal,
    days: seal.days.map((day) => ({ ...day })),
  });
};

const canonicalDay = (
  input: ReaderSummaryWeeklyCertificationSealDay,
  weekStartedOn: string,
  index: number,
): ReaderSummaryWeeklyCertificationSealDay => {
  assertReaderSummaryWeeklyExactObject(
    input,
    dayKeys,
    `weekly certification seal day ${index + 1}`,
    { allowAuthoritativeHashes: true },
  );
  const requestedUtcDate = exactReaderSummaryWeeklyUtcDay(input.requestedUtcDate);
  const publicationEvidenceSha256 = exactReaderSummaryWeeklySha256(
    input.publicationEvidenceSha256,
    "weekly certification publication evidence hash",
  );
  if (
    requestedUtcDate !== utcDayAfter(weekStartedOn, index) ||
    input.publicationEvidenceIdentity !==
      `${readerSummaryWeeklyPublicationEvidenceSchemaVersion}:${publicationEvidenceSha256}` ||
    (input.semanticStatus !== "COMPLETED" && input.semanticStatus !== "NO_SIGNAL")
  ) {
    throw new Error("Reader summary weekly certification seal day is invalid");
  }
  return {
    requestedUtcDate,
    publicationId: exactReaderSummaryWeeklyIdentity(input.publicationId, "publication id"),
    artifactId: exactReaderSummaryWeeklyIdentity(input.artifactId, "artifact id"),
    jobId: exactReaderSummaryWeeklyIdentity(input.jobId, "job id"),
    semanticStatus: input.semanticStatus,
    publicationEvidenceIdentity: input.publicationEvidenceIdentity,
    publicationEvidenceSha256,
  };
};

const exactScope = (
  type: unknown,
  key: unknown,
): string => {
  const scopeKey = exactReaderSummaryWeeklyIdentity(key, "seal scope key");
  if (
    (type === "workspace" && scopeKey === "workspace") ||
    (type === "interest" &&
      /^interest:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(scopeKey))
  ) {
    return scopeKey;
  }
  throw new Error("Reader summary weekly certification seal scope is invalid");
};

const assertUnique = (values: readonly string[], label: string): void => {
  if (new Set(values).size !== values.length) {
    throw new Error(`Reader summary weekly certification seal has duplicate ${label}`);
  }
};

const utcDayAfter = (start: string, offset: number): string =>
  new Date(Date.parse(`${start}T00:00:00.000Z`) + offset * 86_400_000)
    .toISOString().slice(0, 10);
