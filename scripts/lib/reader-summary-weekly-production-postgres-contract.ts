import {
  canonicalizeReaderSummaryWeeklyJson,
  readerSummaryWeeklyScopeKey,
  type ReaderSummaryWeeklyManifestScope,
} from "../../libs/summary/domain/value-objects/reader-summary-weekly-canonical-json";
import { readerSummaryWeeklyCanonicalProviderKeys } from "../../libs/summary/domain/value-objects/reader-summary-weekly-daily-certification";
import type { ReaderSummaryWeeklyCanonicalProviderKey } from "../../libs/summary/domain/value-objects/reader-summary-weekly-daily-certification";
import { readerSummaryWeeklyPublicationEvidenceSchemaVersion } from "../../libs/summary/domain/value-objects/reader-summary-weekly-publication-evidence";
import { readerSummaryWeeklyPublicationGitHubEvidenceSchemaVersion } from "../../libs/summary/domain/value-objects/reader-summary-weekly-publication-github-evidence";

export type ReaderSummaryWeeklyProductionStatus =
  | "complete"
  | "partial"
  | "unavailable";

export type ReaderSummaryWeeklyProductionPostgresClient = {
  query<TRow extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    values?: readonly unknown[],
  ): Promise<{ readonly rows: readonly TRow[] }>;
};

export type ReaderSummaryWeeklyProductionWindow = Readonly<{
  weekStartedOn: string;
  weekEndedOn: string;
  dates: readonly string[];
}>;

export type ReaderSummaryWeeklyProductionScope = Readonly<{
  tenantId: string;
  workspaceId: string;
  scope: ReaderSummaryWeeklyManifestScope;
}>;

export type ReaderSummaryWeeklyProductionCertification = Readonly<{
  requestedUtcDate: string;
  tenantId: string;
  workspaceId: string;
  scope: ReaderSummaryWeeklyManifestScope;
  scopeKey: string;
  publicationId: string;
  artifactId: string;
  jobId: string;
  reportId: string;
  proofId: string;
  semanticStatus: "COMPLETED" | "NO_SIGNAL";
  periodStartedAt: string;
  periodEndedAt: string;
  providerCounts: readonly ReaderSummaryWeeklyProductionProviderCount[];
  githubEvidence: Readonly<Record<string, unknown>>;
  providerEvidence: readonly ReaderSummaryWeeklyProductionProviderEvidence[];
  report: Readonly<Record<string, unknown>>;
  exactProof: Readonly<Record<string, unknown>>;
  canonicalRecord: Readonly<Record<string, unknown>>;
  canonicalSha256: string;
  identity: string;
  recordedAt: string;
}>;

export type ReaderSummaryWeeklyProductionProviderCount = Readonly<{
  providerKey: ReaderSummaryWeeklyCanonicalProviderKey;
  count: number;
}>;

export type ReaderSummaryWeeklyProductionProviderEvidence = Readonly<{
  citationId: string;
  citationField: "title" | "bodyPreview" | "canonicalUrl";
  feedItemId: string;
  sourceItemId: string;
  sourceBindingId: string;
  providerKey: string;
  providerItemId: string;
  canonicalUrl: string;
  title: string;
  sourceText: string;
  publishedAt: string;
  observedAt: string;
  sourceContentHash: string;
}>;

export type ReaderSummaryWeeklyProductionDbState = Readonly<{
  status: ReaderSummaryWeeklyProductionStatus;
  scope: ReaderSummaryWeeklyProductionScope;
  window: ReaderSummaryWeeklyProductionWindow;
  certifications: readonly ReaderSummaryWeeklyProductionCertification[];
  missingDates: readonly string[];
  blockingReasons: readonly string[];
}>;

type WeeklyEvidenceRow = Readonly<{
  requested_utc_date: string;
  tenant_id: string;
  workspace_id: string;
  scope_type: string;
  scope_key: string;
  cadence: string;
  period_started_at: string;
  period_ended_at: string;
  period_timezone: string;
  publication_id: string;
  reader_summary_job_id: string;
  reader_summary_artifact_id: string;
  report_id: string;
  proof_id: string;
  semantic_status: string;
  report: unknown;
  exact_proof: unknown;
  provider_evidence: unknown;
  github_evidence: unknown;
  canonical_record: unknown;
  canonical_sha256: string;
  identity: string;
  recorded_at: string;
}>;

type ContractRow = Readonly<{
  evidence_table: string | null;
  publish_function: string | null;
  column_count: string;
}>;

const dayMs = 86_400_000;

export const resolveReaderSummaryWeeklyProductionWindow = (
  weekStartedOn: string,
): ReaderSummaryWeeklyProductionWindow => {
  const start = exactUtcDate(weekStartedOn, "week start");
  if (new Date(`${start}T00:00:00.000Z`).getUTCDay() !== 1) {
    throw new Error("Reader summary weekly production window must start Monday");
  }
  const dates = Array.from({ length: 7 }, (_, index) =>
    utcDateAfter(start, index),
  );
  return Object.freeze({
    weekStartedOn: start,
    weekEndedOn: dates[6]!,
    dates: Object.freeze(dates),
  });
};

export const previousCompletedReaderSummaryWeeklyProductionWindow = (
  now: Date,
): ReaderSummaryWeeklyProductionWindow => {
  if (!Number.isFinite(now.getTime())) {
    throw new Error("Reader summary weekly production now is invalid");
  }
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const utcDay = new Date(today).getUTCDay();
  const daysSinceMonday = utcDay === 0 ? 6 : utcDay - 1;
  const currentMonday = today - daysSinceMonday * dayMs;
  return resolveReaderSummaryWeeklyProductionWindow(
    new Date(currentMonday - 7 * dayMs).toISOString().slice(0, 10),
  );
};

export const assertReaderSummaryWeeklyProductionPostgresContract = async (
  client: ReaderSummaryWeeklyProductionPostgresClient,
): Promise<void> => {
  const result = await client.query<ContractRow>(
    `
      SELECT
        to_regclass('public.reader_summary_weekly_publication_evidence')::text
          AS evidence_table,
        to_regprocedure('public.publish_reader_summary(jsonb)')::text
          AS publish_function,
        (
          SELECT count(*)::text
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'reader_summary_weekly_publication_evidence'
            AND column_name = ANY($1::text[])
        ) AS column_count
    `,
    [weeklyEvidenceColumns],
  );
  const row = result.rows[0];
  if (
    row?.evidence_table !== "reader_summary_weekly_publication_evidence" ||
    row.publish_function !== "publish_reader_summary(jsonb)" ||
    row.column_count !== String(weeklyEvidenceColumns.length)
  ) {
    throw new Error(
      "missing DB weekly capability: public.reader_summary_weekly_publication_evidence or public.publish_reader_summary(jsonb)",
    );
  }
};

export const loadReaderSummaryWeeklyProductionDbState = async (
  client: ReaderSummaryWeeklyProductionPostgresClient,
  scope: ReaderSummaryWeeklyProductionScope,
  window: ReaderSummaryWeeklyProductionWindow,
): Promise<ReaderSummaryWeeklyProductionDbState> => {
  const exactScope = normalizeScope(scope);
  const scopeKey = readerSummaryWeeklyScopeKey(exactScope.scope);
  const result = await client.query<WeeklyEvidenceRow>(
    `
      SELECT
        to_char(requested_utc_date, 'YYYY-MM-DD') AS requested_utc_date,
        tenant_id::text, workspace_id::text, scope_type, scope_key, cadence,
        to_char(period_started_at AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS period_started_at,
        to_char(period_ended_at AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS period_ended_at,
        period_timezone,
        publication_id::text, reader_summary_job_id::text,
        reader_summary_artifact_id::text, report_id, proof_id,
        semantic_status::text, report, exact_proof, provider_evidence,
        github_evidence, canonical_record, btrim(canonical_sha256)
          AS canonical_sha256,
        identity,
        to_char(recorded_at AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS recorded_at
      FROM reader_summary_weekly_publication_evidence
      WHERE tenant_id = $1::uuid
        AND workspace_id = $2::uuid
        AND scope_type = $3
        AND scope_key = $4
        AND requested_utc_date >= $5::date
        AND requested_utc_date <= $6::date
      ORDER BY requested_utc_date ASC, recorded_at DESC
    `,
    [
      exactScope.tenantId,
      exactScope.workspaceId,
      exactScope.scope.type,
      scopeKey,
      window.weekStartedOn,
      window.weekEndedOn,
    ],
  );
  const certifications = result.rows.map((row) =>
    certificationFromRow(row, exactScope, window),
  );
  assertUniqueDates(certifications);
  const foundDates = new Set(certifications.map((row) => row.requestedUtcDate));
  const missingDates = window.dates.filter((date) => !foundDates.has(date));
  const blockingReasons = [
    ...missingDates.map((date) => `missing DB certification for ${date}`),
    ...certifications.flatMap(certificationBlockingReasons),
  ];
  return Object.freeze({
    status:
      certifications.length === 0
        ? "unavailable"
        : blockingReasons.length === 0 && certifications.length === 7
          ? "complete"
          : "partial",
    scope: exactScope,
    window,
    certifications: Object.freeze(certifications),
    missingDates: Object.freeze(missingDates),
    blockingReasons: Object.freeze(blockingReasons),
  });
};

const certificationFromRow = (
  row: WeeklyEvidenceRow,
  scope: ReaderSummaryWeeklyProductionScope,
  window: ReaderSummaryWeeklyProductionWindow,
): ReaderSummaryWeeklyProductionCertification => {
  const date = exactUtcDate(row.requested_utc_date, "certification date");
  if (!window.dates.includes(date)) {
    throw new Error("Reader summary weekly DB certification escaped window");
  }
  const canonicalRecord = asRecord(row.canonical_record, "canonical record");
  const canonical = canonicalizeReaderSummaryWeeklyJson(canonicalRecord);
  const canonicalSha256 = exactSha(row.canonical_sha256, "canonical sha");
  const identity = exactText(row.identity, "identity");
  if (
    canonical.sha256 !== canonicalSha256 ||
    identity !==
      `${readerSummaryWeeklyPublicationEvidenceSchemaVersion}:${canonicalSha256}`
  ) {
    throw new Error(
      "Reader summary weekly DB certification canonical seal diverged",
    );
  }
  const recordDate = exactTextField(
    canonicalRecord,
    "requestedUtcDate",
    "canonical requested date",
  );
  if (recordDate !== date) {
    throw new Error("Reader summary weekly DB certification date diverged");
  }
  const scopeKey = readerSummaryWeeklyScopeKey(scope.scope);
  if (
    row.tenant_id !== scope.tenantId ||
    row.workspace_id !== scope.workspaceId ||
    row.scope_type !== scope.scope.type ||
    row.scope_key !== scopeKey ||
    row.cadence !== "daily" ||
    row.period_timezone !== "UTC" ||
    row.period_started_at !== `${date}T00:00:00.000Z` ||
    row.period_ended_at !== `${utcDateAfter(date, 1)}T00:00:00.000Z`
  ) {
    throw new Error(
      "Reader summary weekly DB certification scope or daily period diverged",
    );
  }
  return Object.freeze({
    requestedUtcDate: date,
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    scope: scope.scope,
    scopeKey,
    publicationId: exactText(row.publication_id, "publication id"),
    artifactId: exactText(row.reader_summary_artifact_id, "artifact id"),
    jobId: exactText(row.reader_summary_job_id, "job id"),
    reportId: exactText(row.report_id, "report id"),
    proofId: exactText(row.proof_id, "proof id"),
    semanticStatus: exactSemanticStatus(row.semantic_status),
    periodStartedAt: row.period_started_at,
    periodEndedAt: row.period_ended_at,
    providerCounts: providerCountsFromCanonical(canonicalRecord),
    githubEvidence: asRecord(row.github_evidence, "GitHub evidence"),
    providerEvidence: providerEvidenceFromRow(row.provider_evidence),
    report: asRecord(row.report, "report"),
    exactProof: asRecord(row.exact_proof, "exact proof"),
    canonicalRecord,
    canonicalSha256,
    identity,
    recordedAt: exactTimestamp(row.recorded_at, "recorded at"),
  });
};

const certificationBlockingReasons = (
  certification: ReaderSummaryWeeklyProductionCertification,
): readonly string[] => {
  const reasons: string[] = [];
  const github = certification.githubEvidence;
  if (certification.semanticStatus !== "COMPLETED") {
    reasons.push(`${certification.requestedUtcDate} is not completed`);
  }
  if (
    github.schemaVersion !==
      readerSummaryWeeklyPublicationGitHubEvidenceSchemaVersion ||
    github.mode !== "verified" ||
    github.evidenceCount !== 10 ||
    !Array.isArray(github.repositories) ||
    github.repositories.length !== 10 ||
    typeof github.sha256 !== "string" ||
    !/^[0-9a-f]{64}$/u.test(github.sha256)
  ) {
    reasons.push(
      `${certification.requestedUtcDate} lacks verified GitHub DB evidence`,
    );
  }
  const githubCount =
    certification.providerCounts.find(
      (entry) => entry.providerKey === "github-trending-page",
    )?.count ?? 0;
  if (githubCount !== 10) {
    reasons.push(
      `${certification.requestedUtcDate} lacks exact GitHub provider count`,
    );
  }
  return reasons;
};

const providerCountsFromCanonical = (
  canonicalRecord: Readonly<Record<string, unknown>>,
): readonly ReaderSummaryWeeklyProductionProviderCount[] => {
  const counts = asArray(canonicalRecord.providerCounts, "provider counts").map(
    (entry, index) => {
      const row = asRecord(entry, "provider count");
      const providerKey = exactTextField(row, "providerKey", "provider key");
      const expectedProviderKey = readerSummaryWeeklyCanonicalProviderKeys[index];
      const count = row.count;
      if (
        expectedProviderKey === undefined ||
        providerKey !== expectedProviderKey ||
        typeof count !== "number" ||
        !Number.isSafeInteger(count) ||
        count < 0
      ) {
        throw new Error("Reader summary weekly provider count is invalid");
      }
      return Object.freeze({ providerKey: expectedProviderKey, count });
    },
  );
  if (counts.length !== readerSummaryWeeklyCanonicalProviderKeys.length) {
    throw new Error("Reader summary weekly provider counts are incomplete");
  }
  return Object.freeze(counts);
};

const providerEvidenceFromRow = (
  value: unknown,
): readonly ReaderSummaryWeeklyProductionProviderEvidence[] =>
  Object.freeze(
    asArray(value, "provider evidence").map((entry) => {
      const row = asRecord(entry, "provider evidence");
      return Object.freeze({
        citationId: exactTextField(row, "citationId", "citation id"),
        citationField: exactCitationField(row.citationField),
        feedItemId: exactTextField(row, "feedItemId", "feed item id"),
        sourceItemId: exactTextField(row, "sourceItemId", "source item id"),
        sourceBindingId: exactTextField(
          row,
          "sourceBindingId",
          "source binding id",
        ),
        providerKey: exactTextField(row, "providerKey", "provider key"),
        providerItemId: exactTextField(row, "providerItemId", "provider item id"),
        canonicalUrl: exactTextField(row, "canonicalUrl", "canonical URL"),
        title: exactTextField(row, "title", "title"),
        sourceText: exactTextField(row, "sourceText", "source text"),
        publishedAt: exactTimestampField(row, "publishedAt", "published at"),
        observedAt: exactTimestampField(row, "observedAt", "observed at"),
        sourceContentHash: exactSha(
          row.sourceContentHash,
          "source content hash",
        ),
      });
    }),
  );

const normalizeScope = (
  scope: ReaderSummaryWeeklyProductionScope,
): ReaderSummaryWeeklyProductionScope => {
  const tenantId = exactUuid(scope.tenantId, "tenant id");
  const workspaceId = exactUuid(scope.workspaceId, "workspace id");
  if (scope.scope.type === "workspace") {
    return Object.freeze({
      tenantId,
      workspaceId,
      scope: Object.freeze({ type: "workspace" as const }),
    });
  }
  return Object.freeze({
    tenantId,
    workspaceId,
    scope: Object.freeze({
      type: "interest" as const,
      interestId: exactUuid(scope.scope.interestId, "interest id"),
    }),
  });
};

const assertUniqueDates = (
  certifications: readonly ReaderSummaryWeeklyProductionCertification[],
): void => {
  if (
    new Set(certifications.map((row) => row.requestedUtcDate)).size !==
    certifications.length
  ) {
    throw new Error("Reader summary weekly DB certifications are not unique");
  }
};

const exactUtcDate = (value: string, label: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new Error(`Reader summary weekly ${label} is invalid`);
  }
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value) {
    throw new Error(`Reader summary weekly ${label} is invalid`);
  }
  return value;
};

const utcDateAfter = (date: string, offsetDays: number): string =>
  new Date(Date.parse(`${date}T00:00:00.000Z`) + offsetDays * dayMs)
    .toISOString()
    .slice(0, 10);

const asRecord = (
  value: unknown,
  label: string,
): Readonly<Record<string, unknown>> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Reader summary weekly ${label} is invalid`);
  }
  return value as Readonly<Record<string, unknown>>;
};

const asArray = (value: unknown, label: string): readonly unknown[] => {
  if (!Array.isArray(value)) {
    throw new Error(`Reader summary weekly ${label} is invalid`);
  }
  return value;
};

const exactText = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Reader summary weekly ${label} is invalid`);
  }
  return value;
};

const exactTextField = (
  row: Readonly<Record<string, unknown>>,
  key: string,
  label: string,
): string => exactText(row[key], label);

const exactTimestampField = (
  row: Readonly<Record<string, unknown>>,
  key: string,
  label: string,
): string => exactTimestamp(row[key], label);

const exactTimestamp = (value: unknown, label: string): string => {
  const text = exactText(value, label);
  if (new Date(text).toISOString() !== text) {
    throw new Error(`Reader summary weekly ${label} is invalid`);
  }
  return text;
};

const exactSha = (value: unknown, label: string): string => {
  const text = exactText(value, label);
  if (!/^[0-9a-f]{64}$/u.test(text)) {
    throw new Error(`Reader summary weekly ${label} is invalid`);
  }
  return text;
};

const exactUuid = (value: string, label: string): string => {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
      value,
    )
  ) {
    throw new Error(`Reader summary weekly ${label} must be a UUID`);
  }
  return value;
};

const exactSemanticStatus = (value: unknown): "COMPLETED" | "NO_SIGNAL" => {
  if (value === "COMPLETED" || value === "NO_SIGNAL") {
    return value;
  }
  throw new Error("Reader summary weekly semantic status is invalid");
};

const exactCitationField = (
  value: unknown,
): "title" | "bodyPreview" | "canonicalUrl" => {
  if (value === "title" || value === "bodyPreview" || value === "canonicalUrl") {
    return value;
  }
  throw new Error("Reader summary weekly citation field is invalid");
};

const weeklyEvidenceColumns = Object.freeze([
  "publication_id",
  "tenant_id",
  "workspace_id",
  "scope_type",
  "scope_key",
  "cadence",
  "period_started_at",
  "period_ended_at",
  "period_timezone",
  "requested_utc_date",
  "reader_summary_job_id",
  "reader_summary_artifact_id",
  "report_id",
  "proof_id",
  "semantic_status",
  "report",
  "report_sha256",
  "exact_proof",
  "proof_sha256",
  "artifact_payload_sha256",
  "provider_evidence",
  "provider_evidence_sha256",
  "github_evidence",
  "canonical_record",
  "canonical_bytes",
  "canonical_sha256",
  "identity",
  "recorded_at",
]);
