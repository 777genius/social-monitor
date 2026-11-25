import {
  canonicalizeReaderSummaryWeeklyJson,
  readerSummaryWeeklyScopeKey,
} from "../../libs/summary/domain/value-objects/reader-summary-weekly-canonical-json";
import { readerSummaryWeeklyPublicationEvidenceSchemaVersion } from "../../libs/summary/domain/value-objects/reader-summary-weekly-publication-evidence";
import type {
  ReaderSummaryWeeklyProductionCertification,
  ReaderSummaryWeeklyProductionPostgresClient,
  ReaderSummaryWeeklyProductionScope,
  ReaderSummaryWeeklyProductionWindow,
} from "./reader-summary-weekly-production-postgres-contract";

export type ReaderSummaryWeeklyProductionCertificationSealDay = Readonly<{
  requestedUtcDate: string;
  publicationId: string;
  artifactId: string;
  jobId: string;
  semanticStatus: "COMPLETED" | "NO_SIGNAL";
  publicationEvidenceIdentity: string;
  publicationEvidenceSha256: string;
}>;

export type ReaderSummaryWeeklyProductionCertificationSeal = Readonly<{
  sealId: string;
  sealSha256: string;
  tenantId: string;
  workspaceId: string;
  scopeType: "workspace" | "interest";
  scopeKey: string;
  weekStartedOn: string;
  weekEndedOn: string;
  days: readonly ReaderSummaryWeeklyProductionCertificationSealDay[];
  canonicalRecord: Readonly<Record<string, unknown>>;
  canonicalBytes: string;
  recordedAt: string;
}>;

type WeeklyCertificationSealRow = Readonly<{
  seal_id: string;
  seal_sha256: string;
  tenant_id: string;
  workspace_id: string;
  scope_type: string;
  scope_key: string;
  week_started_on: string;
  week_ended_on: string;
  days: unknown;
  canonical_record: unknown;
  canonical_bytes: string;
  recorded_at: string;
}>;

export const loadReaderSummaryWeeklyProductionCertificationSeal = async (
  client: ReaderSummaryWeeklyProductionPostgresClient,
  scope: ReaderSummaryWeeklyProductionScope,
  window: ReaderSummaryWeeklyProductionWindow,
): Promise<ReaderSummaryWeeklyProductionCertificationSeal | null> => {
  const scopeKey = readerSummaryWeeklyScopeKey(scope.scope);
  const result = await client.query<WeeklyCertificationSealRow>(
    `
      SELECT
        seal_id, btrim(seal_sha256) AS seal_sha256,
        tenant_id::text, workspace_id::text, scope_type, scope_key,
        to_char(week_started_on, 'YYYY-MM-DD') AS week_started_on,
        to_char(week_ended_on, 'YYYY-MM-DD') AS week_ended_on,
        days, canonical_record,
        convert_from(canonical_bytes, 'UTF8') AS canonical_bytes,
        to_char(recorded_at AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS recorded_at
      FROM reader_summary_weekly_certification_seals
      WHERE tenant_id = $1::uuid
        AND workspace_id = $2::uuid
        AND scope_type = $3
        AND scope_key = $4
        AND week_started_on = $5::date
        AND week_ended_on = $6::date
    `,
    [
      scope.tenantId,
      scope.workspaceId,
      scope.scope.type,
      scopeKey,
      window.weekStartedOn,
      window.weekEndedOn,
    ],
  );
  if (result.rows.length > 1) {
    throw new Error("Reader summary weekly DB certification seal is not unique");
  }
  return result.rows[0] === undefined
    ? null
    : certificationSealFromRow(result.rows[0], scope, window);
};

export const assertReaderSummaryWeeklyProductionCertificationSealBinding = (
  seal: ReaderSummaryWeeklyProductionCertificationSeal,
  certifications: readonly ReaderSummaryWeeklyProductionCertification[],
  window: ReaderSummaryWeeklyProductionWindow,
): void => {
  if (
    certifications.length !== 7 ||
    seal.days.some((day, index) => {
      const certification = certifications[index];
      return (
        certification === undefined ||
        day.requestedUtcDate !== window.dates[index] ||
        certification.requestedUtcDate !== day.requestedUtcDate ||
        certification.publicationId !== day.publicationId ||
        certification.artifactId !== day.artifactId ||
        certification.jobId !== day.jobId ||
        certification.semanticStatus !== day.semanticStatus ||
        certification.identity !== day.publicationEvidenceIdentity ||
        certification.canonicalSha256 !== day.publicationEvidenceSha256
      );
    })
  ) {
    throw new Error(
      "Reader summary weekly persisted DB certification seal is stale or mismatched",
    );
  }
};

const certificationSealFromRow = (
  row: WeeklyCertificationSealRow,
  scope: ReaderSummaryWeeklyProductionScope,
  window: ReaderSummaryWeeklyProductionWindow,
): ReaderSummaryWeeklyProductionCertificationSeal => {
  const record = asRecord(row.canonical_record, "certification seal record");
  assertExactKeys(record, sealKeys, "certification seal record");
  const rawDays = asArray(record.days, "certification seal days");
  if (rawDays.length !== 7) {
    throw new Error(
      "Reader summary weekly DB certification seal must contain exact 7/7 days",
    );
  }
  const days = Object.freeze(
    rawDays.map((value, index) => sealDay(value, window, index)),
  );
  const sealSha256 = exactSha(row.seal_sha256, "certification seal sha");
  const sealId = exactText(row.seal_id, "certification seal id");
  const body = Object.fromEntries(
    Object.entries(record).filter(
      ([key]) => key !== "sealId" && key !== "sealSha",
    ),
  );
  const canonicalBody = canonicalizeReaderSummaryWeeklyJson(
    body,
    "persisted weekly certification seal body",
  );
  const scopeKey = readerSummaryWeeklyScopeKey(scope.scope);
  if (
    record.schemaVersion !== "reader_summary.weekly_certification_seal.v1" ||
    record.sealId !== sealId ||
    record.sealSha !== sealSha256 ||
    sealId !== `reader_summary.weekly_certification_seal.v1:${sealSha256}` ||
    canonicalBody.sha256 !== sealSha256 ||
    row.canonical_bytes !== canonicalBody.json ||
    canonicalizeReaderSummaryWeeklyJson(row.days).json !==
      canonicalizeReaderSummaryWeeklyJson(rawDays).json ||
    row.tenant_id !== scope.tenantId ||
    row.workspace_id !== scope.workspaceId ||
    row.scope_type !== scope.scope.type ||
    row.scope_key !== scopeKey ||
    row.week_started_on !== window.weekStartedOn ||
    row.week_ended_on !== window.weekEndedOn ||
    record.tenantId !== scope.tenantId ||
    record.workspaceId !== scope.workspaceId ||
    record.scopeType !== scope.scope.type ||
    record.scopeKey !== scopeKey ||
    record.weekStartedOn !== window.weekStartedOn ||
    record.weekEndedOn !== window.weekEndedOn
  ) {
    throw new Error(
      "Reader summary weekly persisted DB certification seal diverged",
    );
  }
  return Object.freeze({
    sealId,
    sealSha256,
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    scopeType: scope.scope.type,
    scopeKey,
    weekStartedOn: window.weekStartedOn,
    weekEndedOn: window.weekEndedOn,
    days,
    canonicalRecord: record,
    canonicalBytes: row.canonical_bytes,
    recordedAt: exactTimestamp(row.recorded_at, "certification seal recorded at"),
  });
};

const sealDay = (
  value: unknown,
  window: ReaderSummaryWeeklyProductionWindow,
  index: number,
): ReaderSummaryWeeklyProductionCertificationSealDay => {
  const day = asRecord(value, "certification seal day");
  assertExactKeys(day, sealDayKeys, "certification seal day");
  const requestedUtcDate = exactUtcDate(
    exactText(day.requestedUtcDate, "certification seal day date"),
  );
  const publicationEvidenceSha256 = exactSha(
    day.publicationEvidenceSha256,
    "certification seal daily evidence sha",
  );
  const publicationEvidenceIdentity = exactText(
    day.publicationEvidenceIdentity,
    "certification seal daily evidence identity",
  );
  if (
    requestedUtcDate !== window.dates[index] ||
    publicationEvidenceIdentity !==
      `${readerSummaryWeeklyPublicationEvidenceSchemaVersion}:${publicationEvidenceSha256}`
  ) {
    throw new Error(
      "Reader summary weekly DB certification seal day binding diverged",
    );
  }
  return Object.freeze({
    requestedUtcDate,
    publicationId: exactText(day.publicationId, "certification seal publication id"),
    artifactId: exactText(day.artifactId, "certification seal artifact id"),
    jobId: exactText(day.jobId, "certification seal job id"),
    semanticStatus: exactSemanticStatus(day.semanticStatus),
    publicationEvidenceIdentity,
    publicationEvidenceSha256,
  });
};

const sealKeys = Object.freeze([
  "schemaVersion", "tenantId", "workspaceId", "scopeType", "scopeKey",
  "weekStartedOn", "weekEndedOn", "days", "sealId", "sealSha",
]);
const sealDayKeys = Object.freeze([
  "requestedUtcDate", "publicationId", "artifactId", "jobId",
  "semanticStatus", "publicationEvidenceIdentity",
  "publicationEvidenceSha256",
]);

const asRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Reader summary weekly ${label} is invalid`);
  }
  return value as Record<string, unknown>;
};

const asArray = (value: unknown, label: string): readonly unknown[] => {
  if (!Array.isArray(value)) {
    throw new Error(`Reader summary weekly ${label} is invalid`);
  }
  return value;
};

const assertExactKeys = (
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[],
  label: string,
): void => {
  const actual = Object.keys(value).sort();
  const canonicalExpected = [...expected].sort();
  if (actual.length !== canonicalExpected.length ||
      actual.some((key, index) => key !== canonicalExpected[index])) {
    throw new Error(`Reader summary weekly ${label} shape is invalid`);
  }
};

const exactText = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Reader summary weekly ${label} is invalid`);
  }
  return value;
};

const exactSha = (value: unknown, label: string): string => {
  const text = exactText(value, label);
  if (!/^[0-9a-f]{64}$/u.test(text)) {
    throw new Error(`Reader summary weekly ${label} is invalid`);
  }
  return text;
};

const exactUtcDate = (value: string): string => {
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value) ||
      !Number.isFinite(parsed) ||
      new Date(parsed).toISOString().slice(0, 10) !== value) {
    throw new Error("Reader summary weekly certification seal day date is invalid");
  }
  return value;
};

const exactTimestamp = (value: unknown, label: string): string => {
  const text = exactText(value, label);
  if (new Date(text).toISOString() !== text) {
    throw new Error(`Reader summary weekly ${label} is invalid`);
  }
  return text;
};

const exactSemanticStatus = (value: unknown): "COMPLETED" | "NO_SIGNAL" => {
  if (value === "COMPLETED" || value === "NO_SIGNAL") {
    return value;
  }
  throw new Error("Reader summary weekly certification seal status is invalid");
};
