import {
  canonicalizeReaderSummaryWeeklyJson,
  readerSummaryWeeklyScopeKey,
  type ReaderSummaryWeeklyManifestScope,
} from "../../libs/summary/domain/value-objects/reader-summary-weekly-canonical-json";
import { readerSummaryWeeklyCanonicalProviderKeys } from "../../libs/summary/domain/value-objects/reader-summary-weekly-daily-certification";
import type { ReaderSummaryWeeklyCanonicalProviderKey } from "../../libs/summary/domain/value-objects/reader-summary-weekly-daily-certification";
import { readerSummaryWeeklyPublicationEvidenceSchemaVersion } from "../../libs/summary/domain/value-objects/reader-summary-weekly-publication-evidence";
import {
  assertReaderSummaryWeeklyPublicationGitHubEvidence,
  type ReaderSummaryWeeklyPublicationGitHubEvidence,
} from "../../libs/summary/domain/value-objects/reader-summary-weekly-publication-github-evidence";
import {
  assertGitHubProviderBinding,
  assertPublicationEvidenceSemantics,
  canonicalProviderEvidence,
} from "../../libs/summary/domain/value-objects/reader-summary-weekly-publication-evidence-validation";
import {
  assertReaderSummaryWeeklyProductionCertificationSealBinding,
  loadReaderSummaryWeeklyProductionCertificationSeal,
  type ReaderSummaryWeeklyProductionCertificationSeal,
} from "./reader-summary-weekly-production-certification-seal";
import type {
  ReaderSummaryWeeklyReviewAuthority,
} from "../../libs/summary/domain/value-objects/reader-summary-weekly-review-manifest";

export type {
  ReaderSummaryWeeklyProductionCertificationSeal,
  ReaderSummaryWeeklyProductionCertificationSealDay,
} from "./reader-summary-weekly-production-certification-seal";

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

export type ReaderSummaryWeeklyProductionPostgresConnection =
  ReaderSummaryWeeklyProductionPostgresClient & {
    release(): void;
  };

export type ReaderSummaryWeeklyProductionPostgresPool = {
  connect(): Promise<ReaderSummaryWeeklyProductionPostgresConnection>;
};

export type ReaderSummaryWeeklyProductionDatabaseAccess =
  | Readonly<{
      kind: "tenant";
      tenantId: string;
      workspaceId: string;
    }>
  | Readonly<{ kind: "system" }>;

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
  providerKey: ReaderSummaryWeeklyCanonicalProviderKey;
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
  weeklyCertificationSeal:
    | ReaderSummaryWeeklyProductionCertificationSeal
    | null;
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
  backfill_function: string | null;
  backfill_fixed_search_path: boolean;
  backfill_owner: string | null;
  backfill_public_execute: boolean;
  backfill_runtime_execute: boolean;
  backfill_security_definer: boolean;
  slot_prepare_function: string | null;
  slot_prepare_fixed_search_path: boolean;
  slot_prepare_owner: string | null;
  slot_prepare_public_execute: boolean;
  slot_prepare_runtime_execute: boolean;
  slot_prepare_security_definer: boolean;
  column_count: string;
}>;

const dayMs = 86_400_000;
const weeklyDatabaseTransactionAttempts = 3;

export const withReaderSummaryWeeklyProductionDatabaseAccess = async <T>(
  pool: ReaderSummaryWeeklyProductionPostgresPool,
  access: ReaderSummaryWeeklyProductionDatabaseAccess,
  operation: (
    client: ReaderSummaryWeeklyProductionPostgresClient,
  ) => Promise<T>,
): Promise<T> => {
  for (
    let attempt = 1;
    attempt <= weeklyDatabaseTransactionAttempts;
    attempt += 1
  ) {
    const connection = await pool.connect();
    try {
      await connection.query(
        "BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE",
      );
      const tenantId = access.kind === "tenant" ? access.tenantId : "";
      const workspaceId = access.kind === "tenant" ? access.workspaceId : "";
      await connection.query(
        `SELECT set_config('social_monitor.tenant_id', $1, true),
                set_config('social_monitor.workspace_id', $2, true),
                set_config('social_monitor.system_access', $3, true)`,
        [
          tenantId,
          workspaceId,
          access.kind === "system" ? "true" : "false",
        ],
      );
      const result = await operation(connection);
      await connection.query("COMMIT");
      return result;
    } catch (error: unknown) {
      await connection.query("ROLLBACK").catch(() => undefined);
      if (
        attempt === weeklyDatabaseTransactionAttempts ||
        !isRetryableWeeklyDatabaseConflict(error)
      ) {
        throw error;
      }
    } finally {
      connection.release();
    }
  }
  throw new Error("Reader summary weekly database retry invariant failed");
};

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

export const resolveCompletedReaderSummaryWeeklyProductionWindow = (
  weekStartedOn: string,
  now: Date,
): ReaderSummaryWeeklyProductionWindow => {
  const window = resolveReaderSummaryWeeklyProductionWindow(weekStartedOn);
  if (!Number.isFinite(now.getTime())) {
    throw new Error("Reader summary weekly production now is invalid");
  }
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  if (
    Date.parse(`${window.weekEndedOn}T00:00:00.000Z`) >= today
  ) {
    throw new Error(
      "Reader summary weekly production window must be completed",
    );
  }
  return window;
};

export const assertReaderSummaryWeeklyProductionWindow = (
  window: ReaderSummaryWeeklyProductionWindow,
): void => {
  const expected = resolveReaderSummaryWeeklyProductionWindow(
    window.weekStartedOn,
  );
  if (
    window.weekEndedOn !== expected.weekEndedOn ||
    !Array.isArray(window.dates) ||
    window.dates.length !== expected.dates.length ||
    window.dates.some((date, index) => date !== expected.dates[index])
  ) {
    throw new Error(
      "Reader summary weekly production window must be exact Monday-Sunday UTC",
    );
  }
};

export const assertReaderSummaryWeeklyProductionPostgresContract = async (
  client: ReaderSummaryWeeklyProductionPostgresClient,
): Promise<void> => {
  const result = await client.query<ContractRow>(
    `
      WITH backfill AS (
        SELECT
          procedure.prosecdef,
          procedure.proconfig,
          procedure.proowner,
          procedure.proacl,
          procedure.oid
        FROM pg_catalog.pg_proc AS procedure
        WHERE procedure.oid = pg_catalog.to_regprocedure(
          'public.backfill_reader_summary_weekly_daily_certifications(uuid,uuid,text,text,date)'
        )
      ), slot_prepare AS (
        SELECT
          procedure.prosecdef,
          procedure.proconfig,
          procedure.proowner,
          procedure.proacl,
          procedure.oid
        FROM pg_catalog.pg_proc AS procedure
        WHERE procedure.oid = pg_catalog.to_regprocedure(
          'public.prepare_reader_summary_weekly_production_slot(uuid,uuid,text,text,date)'
        )
      )
      SELECT
        to_regclass('public.reader_summary_weekly_publication_evidence')::text
          AS evidence_table,
        to_regprocedure('public.publish_reader_summary(jsonb)')::text
          AS publish_function,
        to_regprocedure(
          'public.backfill_reader_summary_weekly_daily_certifications(uuid,uuid,text,text,date)'
        )::text AS backfill_function,
        to_regprocedure(
          'public.prepare_reader_summary_weekly_production_slot(uuid,uuid,text,text,date)'
        )::text AS slot_prepare_function,
        backfill.prosecdef AS backfill_security_definer,
        slot_prepare.prosecdef AS slot_prepare_security_definer,
        slot_prepare.proconfig = ARRAY[
          'search_path=pg_catalog, public'
        ]::text[] AS slot_prepare_fixed_search_path,
        pg_catalog.pg_get_userbyid(slot_prepare.proowner)
          AS slot_prepare_owner,
        pg_catalog.has_function_privilege(
          current_user,
          slot_prepare.oid,
          'EXECUTE'
        ) AS slot_prepare_runtime_execute,
        EXISTS (
          SELECT 1
          FROM pg_catalog.aclexplode(
            COALESCE(
              slot_prepare.proacl,
              pg_catalog.acldefault('f', slot_prepare.proowner)
            )
          ) AS privilege
          WHERE privilege.grantee = 0
            AND privilege.privilege_type = 'EXECUTE'
        ) AS slot_prepare_public_execute,
        backfill.proconfig = ARRAY[
          'search_path=pg_catalog, public, pg_temp'
        ]::text[] AS backfill_fixed_search_path,
        pg_catalog.pg_get_userbyid(backfill.proowner) AS backfill_owner,
        pg_catalog.has_function_privilege(
          'social_monitor_reader_summary_publication_runtime',
          backfill.oid,
          'EXECUTE'
        ) AS backfill_runtime_execute,
        EXISTS (
          SELECT 1
          FROM pg_catalog.aclexplode(
            COALESCE(
              backfill.proacl,
              pg_catalog.acldefault('f', backfill.proowner)
            )
          ) AS privilege
          WHERE privilege.grantee = 0
            AND privilege.privilege_type = 'EXECUTE'
        ) AS backfill_public_execute,
        (
          SELECT count(*)::text
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'reader_summary_weekly_publication_evidence'
            AND column_name = ANY($1::text[])
        ) AS column_count
      FROM backfill CROSS JOIN slot_prepare
    `,
    [weeklyEvidenceColumns],
  );
  const row = result.rows[0];
  if (
    row?.evidence_table !== "reader_summary_weekly_publication_evidence" ||
    row.publish_function !== "publish_reader_summary(jsonb)" ||
    row.backfill_function !==
      "backfill_reader_summary_weekly_daily_certifications(uuid,uuid,text,text,date)" ||
    row.backfill_security_definer !== true ||
    row.backfill_fixed_search_path !== true ||
    row.backfill_owner !==
      "social_monitor_reader_summary_publication_owner" ||
    row.backfill_runtime_execute !== true ||
    row.backfill_public_execute !== false ||
    row.slot_prepare_function !==
      "prepare_reader_summary_weekly_production_slot(uuid,uuid,text,text,date)" ||
    row.slot_prepare_security_definer !== true ||
    row.slot_prepare_fixed_search_path !== true ||
    row.slot_prepare_owner !==
      "social_monitor_reader_summary_publication_owner" ||
    row.slot_prepare_runtime_execute !== true ||
    row.slot_prepare_public_execute !== false ||
    row.column_count !== String(weeklyEvidenceColumns.length)
  ) {
    throw new Error(
      "missing DB weekly capability: evidence table, publish function, or daily certification backfill function",
    );
  }
};

export const loadReaderSummaryWeeklyProductionDbState = async (
  client: ReaderSummaryWeeklyProductionPostgresClient,
  scope: ReaderSummaryWeeklyProductionScope,
  window: ReaderSummaryWeeklyProductionWindow,
): Promise<ReaderSummaryWeeklyProductionDbState> => {
  assertReaderSummaryWeeklyProductionWindow(window);
  const exactScope = normalizeScope(scope);
  const scopeKey = readerSummaryWeeklyScopeKey(exactScope.scope);
  const weeklyCertificationSeal =
    await loadReaderSummaryWeeklyProductionCertificationSeal(
      client,
      exactScope,
      window,
    );
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
  if (weeklyCertificationSeal !== null) {
    assertReaderSummaryWeeklyProductionCertificationSealBinding(
      weeklyCertificationSeal,
      certifications,
      window,
    );
  }
  const blockingReasons = [
    ...(weeklyCertificationSeal === null
      ? ["missing persisted DB weekly certification seal"]
      : []),
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
    weeklyCertificationSeal,
    certifications: Object.freeze(certifications),
    missingDates: Object.freeze(missingDates),
    blockingReasons: Object.freeze(blockingReasons),
  });
};

export const readerSummaryWeeklyReviewAuthorityFromProductionState = (
  state: ReaderSummaryWeeklyProductionDbState,
): ReaderSummaryWeeklyReviewAuthority => {
  const seal = state.weeklyCertificationSeal;
  if (state.status !== "complete" || seal === null || state.certifications.length !== 7) {
    throw new Error("Reader summary weekly review requires seven sealed daily authorities");
  }
  assertReaderSummaryWeeklyProductionCertificationSealBinding(
    seal,
    state.certifications,
    state.window,
  );
  return Object.freeze({
    sealId: seal.sealId,
    sealSha256: seal.sealSha256,
    tenantId: state.scope.tenantId,
    workspaceId: state.scope.workspaceId,
    scope: state.scope.scope,
    weekStartedOn: state.window.weekStartedOn,
    weekEndedOn: state.window.weekEndedOn,
    days: Object.freeze(state.certifications.map((certification, index) => {
      const githubEvidence = certification.githubEvidence as ReaderSummaryWeeklyPublicationGitHubEvidence;
      const sealDay = seal.days[index];
      if (
        sealDay === undefined ||
        sealDay.requestedUtcDate !== certification.requestedUtcDate ||
        sealDay.publicationId !== certification.publicationId ||
        sealDay.publicationEvidenceIdentity !== certification.identity ||
        sealDay.publicationEvidenceSha256 !== certification.canonicalSha256
      ) {
        throw new Error("Reader summary weekly review certification seal day diverged");
      }
      return Object.freeze({
        requestedUtcDate: certification.requestedUtcDate,
        publicationId: certification.publicationId,
        publicationEvidenceIdentity: certification.identity,
        publicationEvidenceSha256: certification.canonicalSha256,
        providerEvidenceSha256: canonicalizeReaderSummaryWeeklyJson(
          certification.providerEvidence,
          "weekly review provider authority",
        ).sha256,
        githubEvidenceSha256: githubEvidence.sha256,
        semanticStatus: certification.semanticStatus,
        githubMode: githubEvidence.mode,
        providerEvidence: Object.freeze(certification.providerEvidence.map((evidence) =>
          Object.freeze({
            providerKey: evidence.providerKey,
            citationId: evidence.citationId,
            feedItemId: evidence.feedItemId,
            sourceItemId: evidence.sourceItemId,
            sourceBindingId: evidence.sourceBindingId,
            providerItemId: evidence.providerItemId,
            canonicalUrl: evidence.canonicalUrl,
            sourceContentHash: evidence.sourceContentHash,
            publishedAt: evidence.publishedAt,
            observedAt: evidence.observedAt,
            title: evidence.title,
            sourceText: evidence.sourceText,
          }),
        )),
      });
    })),
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
  if (
    canonicalRecord.semanticStatus !== row.semantic_status ||
    canonicalizeReaderSummaryWeeklyJson(
      canonicalRecord.githubEvidence,
    ).json !== canonicalizeReaderSummaryWeeklyJson(row.github_evidence).json ||
    canonicalizeReaderSummaryWeeklyJson(
      canonicalRecord.providerEvidence,
    ).json !== canonicalizeReaderSummaryWeeklyJson(row.provider_evidence).json
  ) {
    throw new Error(
      "Reader summary weekly DB certification authority diverged",
    );
  }
  const githubEvidence = row.github_evidence;
  assertReaderSummaryWeeklyPublicationGitHubEvidence(githubEvidence);
  if (githubEvidence.requestedUtcDay !== date) {
    throw new Error(
      "Reader summary weekly DB certification GitHub date diverged",
    );
  }
  const semanticStatus = exactSemanticStatus(row.semantic_status);
  const providerEvidence = providerEvidenceFromRow(row.provider_evidence);
  const providerCounts = providerCountsFromCanonical(canonicalRecord);
  assertGitHubProviderBinding(providerEvidence, githubEvidence);
  assertPublicationEvidenceSemantics(
    semanticStatus,
    providerEvidence,
    providerCounts,
    githubEvidence,
  );
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
    semanticStatus,
    periodStartedAt: row.period_started_at,
    periodEndedAt: row.period_ended_at,
    providerCounts,
    githubEvidence,
    providerEvidence,
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
  const github =
    certification.githubEvidence as ReaderSummaryWeeklyPublicationGitHubEvidence;
  const githubCount =
    certification.providerCounts.find(
      (entry) => entry.providerKey === "github-trending-page",
    )?.count ?? 0;
  const providerCountsMatch = certification.providerCounts.every(
    ({ providerKey, count }) =>
      certification.providerEvidence.filter(
        (evidence) => evidence.providerKey === providerKey,
      ).length === count,
  );
  if (!providerCountsMatch) {
    reasons.push(
      `${certification.requestedUtcDate} has divergent DB provider counts`,
    );
  }

  if (certification.semanticStatus === "NO_SIGNAL") {
    if (
      github.mode !== "ordinary_not_required" ||
      githubCount !== 0 ||
      certification.providerEvidence.length !== 0 ||
      certification.providerCounts.some(({ count }) => count !== 0)
    ) {
      reasons.push(
        `${certification.requestedUtcDate} lacks ordinary NO_SIGNAL DB evidence`,
      );
    }
    return reasons;
  }

  const honestHistoricalUnavailable =
    github.mode === "historical_unavailable" &&
    githubCount === 0 &&
    certification.providerEvidence.every(
      (evidence) => evidence.providerKey !== "github-trending-page",
    );
  if (
    !honestHistoricalUnavailable &&
    (github.mode !== "verified" || githubCount !== 10)
  ) {
    reasons.push(
      `${certification.requestedUtcDate} lacks verified GitHub DB evidence`,
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
): readonly ReaderSummaryWeeklyProductionProviderEvidence[] => {
  const rawEvidence = asArray(value, "provider evidence");
  const evidence = canonicalProviderEvidence(
    rawEvidence as readonly ReaderSummaryWeeklyProductionProviderEvidence[],
  );
  if (
    canonicalizeReaderSummaryWeeklyJson(rawEvidence).json !==
    canonicalizeReaderSummaryWeeklyJson(evidence).json
  ) {
    throw new Error(
      "Reader summary weekly DB provider evidence order diverged",
    );
  }
  return evidence;
};

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

const isRetryableWeeklyDatabaseConflict = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }
  const code = (error as Readonly<{ code?: unknown }>).code;
  return code === "40001" || code === "40P01";
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
