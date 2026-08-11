import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

import { Pool, type PoolClient } from "pg";

export const dailyDeliveryC1FirstDate = "2026-07-23" as const;
export const dailyDeliveryC1RecoveryThroughEnv =
  "READER_SUMMARY_DAILY_DELIVERY_C1_RECOVERY_THROUGH" as const;
export const dailyDeliveryC1RecoveryThroughFileEnv =
  "READER_SUMMARY_DAILY_DELIVERY_C1_RECOVERY_THROUGH_FILE" as const;
export const dailyDeliveryC1AdoptOnlyDates = Object.freeze([
  "2026-07-25",
  "2026-07-26",
  "2026-07-27",
  "2026-07-28",
  "2026-07-29",
  "2026-07-30",
] as const);

type C0Terminal = Readonly<{
  outcome: string;
  requestedUtcDate: string;
  attemptOrdinal: number | null;
  readerSummaryJobId: string | null;
  readerSummaryArtifactId: string | null;
  publicationId: string | null;
  reportSha256: string | null;
  proofSha256: string | null;
  weeklyEvidenceSha256: string | null;
  publicEvidenceSha256: string | null;
  publicFrontendSha256: string | null;
}>;

type DeliveryDay = Readonly<{
  requestedUtcDate: string;
  disposition: "adopt_c0" | "precollect";
}>;

type DeliveryPublicationBinding = Readonly<{
  requestedUtcDate: string;
  readerSummaryJobId: string;
  readerSummaryArtifactId: string;
  publicationId: string;
  reportSha256: string;
  proofSha256: string;
  weeklyEvidenceSha256: string;
  publicEvidenceSha256: string;
  publicFrontendSha256: string;
}>;

export const planDailyDeliveryC1 = (
  input: Readonly<{
    nextUnresolvedUtcDate: string | null;
    yesterdayUtcDate: string;
    publishedDates: readonly string[];
  }>,
): readonly DeliveryDay[] => {
  const first = input.nextUnresolvedUtcDate ?? dailyDeliveryC1FirstDate;
  requireUtcDate(first, "next unresolved date");
  requireUtcDate(input.yesterdayUtcDate, "UTC yesterday");
  if (first < dailyDeliveryC1FirstDate) {
    throw new Error(
      "Daily delivery C1 cursor predates the frozen recovery start",
    );
  }
  const published = new Set(input.publishedDates);
  return dates(first, input.yesterdayUtcDate).map((requestedUtcDate) => ({
    requestedUtcDate,
    disposition: published.has(requestedUtcDate) ? "adopt_c0" : "precollect",
  }));
};

export const assertDailyDeliveryC1CaughtUp = (
  input: Readonly<{
    nextUnresolvedUtcDate: string | null;
    yesterdayUtcDate: string;
    publishedDates: readonly string[];
  }>,
): void => {
  const required = dates(dailyDeliveryC1FirstDate, input.yesterdayUtcDate);
  const published = new Set(input.publishedDates);
  const missing = required.filter((date) => !published.has(date));
  if (missing.length > 0) {
    throw new Error(
      `Daily delivery C1 cannot report CAUGHT_UP; missing published days: ${missing.join(",")}`,
    );
  }
  const expectedCursor = addDay(input.yesterdayUtcDate);
  if (input.nextUnresolvedUtcDate !== expectedCursor) {
    throw new Error(
      `Daily delivery C1 cannot report CAUGHT_UP; cursor must equal ${expectedCursor}`,
    );
  }
};

export const runDailyDeliveryC1 = async (
  mode: "precollect" | "verify-caught-up",
): Promise<void> => {
  const databaseUrl = required("SYSTEM_DATABASE_URL");
  const parsed = new URL(databaseUrl);
  if (decodeURIComponent(parsed.username) !== "social_monitor_system_app") {
    throw new Error(
      "Daily delivery C1 requires the production system runtime role",
    );
  }
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    application_name: `reader-summary-daily-delivery-c1-${mode}`,
  });
  const terminalDatabaseUrl = new URL(databaseUrl);
  terminalDatabaseUrl.username = "social_monitor_reader_summary_daily_terminal";
  const terminalPool = new Pool({
    connectionString: terminalDatabaseUrl.toString(),
    max: 1,
    application_name: `reader-summary-daily-delivery-c1-terminal-${mode}`,
  });
  const client = await pool.connect();
  try {
    const scope = {
      tenantId: required("READER_SUMMARY_DAILY_TENANT_ID"),
      workspaceId: required("READER_SUMMARY_DAILY_WORKSPACE_ID"),
    };
    const c0Terminals = await readC0Terminals(terminalPool, scope);
    const frozenRecoveryThrough =
      mode === "verify-caught-up"
        ? requiredUtcDateEnv(dailyDeliveryC1RecoveryThroughEnv)
        : undefined;
    const state = await readDeliveryState(
      client,
      scope,
      c0Terminals,
      frozenRecoveryThrough,
    );
    if (mode === "precollect") {
      const plan = planDailyDeliveryC1(state);
      writeDailyDeliveryC1RecoveryThroughFile(
        required(dailyDeliveryC1RecoveryThroughFileEnv),
        state.yesterdayUtcDate,
      );
      let precollected = 0;
      for (const day of plan) {
        if (day.disposition === "adopt_c0") {
          if (
            dailyDeliveryC1AdoptOnlyDates.includes(
              day.requestedUtcDate as never,
            )
          ) {
            console.log(
              `daily-delivery-c1 adopt-c0 date=${day.requestedUtcDate}`,
            );
          }
          continue;
        }
        const result = spawnSync(
          "npm",
          [
            "run",
            "run:reader-summary-clean-real-day-collection",
            "--",
            "--update",
            "--date",
            day.requestedUtcDate,
            "--provider-catch-up",
            "--wait-for-x-readiness",
          ],
          { cwd: process.cwd(), env: process.env, stdio: "inherit" },
        );
        if (result.error !== undefined || result.status !== 0) {
          throw new Error(
            `Daily delivery C1 precollection failed for ${day.requestedUtcDate}`,
          );
        }
        precollected += 1;
      }
      console.log(
        `daily-delivery-c1 precollected-before-claim=${precollected} adopted=${plan.length - precollected}`,
      );
      return;
    }
    assertDailyDeliveryC1CaughtUp(state);
    writeCaughtUpReceipt({
      yesterdayUtcDate: state.yesterdayUtcDate,
      publishedDates: state.publishedDates,
      publicationBindings: state.publicationBindings,
    });
    console.log(
      `daily-delivery-c1 outcome=CAUGHT_UP eligibleThrough=${state.yesterdayUtcDate}`,
    );
  } finally {
    client.release();
    await Promise.all([pool.end(), terminalPool.end()]);
  }
};

const readC0Terminals = async (
  pool: Pool,
  scope: Readonly<{ tenantId: string; workspaceId: string }>,
): Promise<readonly C0Terminal[]> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY");
    const result = await client.query<C0Terminal>(
      `SELECT outcome,
      requested_utc_date::TEXT AS "requestedUtcDate",
      attempt_ordinal AS "attemptOrdinal",
      reader_summary_job_id::TEXT AS "readerSummaryJobId",
      reader_summary_artifact_id::TEXT AS "readerSummaryArtifactId",
      publication_id::TEXT AS "publicationId",
      report_sha256 AS "reportSha256", proof_sha256 AS "proofSha256",
      weekly_evidence_sha256 AS "weeklyEvidenceSha256",
      public_evidence_sha256 AS "publicEvidenceSha256",
      public_frontend_sha256 AS "publicFrontendSha256"
    FROM public."read_reader_summary_daily_canonical_recovery_v4_terminals"(
      $1::UUID, $2::UUID
    )`,
      [scope.tenantId, scope.workspaceId],
    );
    await client.query("COMMIT");
    return result.rows;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};

const readDeliveryState = async (
  client: PoolClient,
  scope: Readonly<{ tenantId: string; workspaceId: string }>,
  c0Terminals: readonly C0Terminal[],
  frozenRecoveryThrough: string | undefined,
): Promise<
  Readonly<{
    nextUnresolvedUtcDate: string | null;
    yesterdayUtcDate: string;
    publishedDates: readonly string[];
    publicationBindings: readonly DeliveryPublicationBinding[];
  }>
> => {
  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY");
  try {
    await client.query(
      `SELECT
      set_config('social_monitor.tenant_id', $1::UUID::TEXT, true),
      set_config('social_monitor.workspace_id', $2::UUID::TEXT, true),
      set_config('social_monitor.system_access', 'false', true)`,
      [scope.tenantId, scope.workspaceId],
    );
    const recoveryThroughSql =
      frozenRecoveryThrough === undefined
        ? "((statement_timestamp() AT TIME ZONE 'UTC')::DATE - 1)"
        : "$3::DATE";
    const result = await client.query<{
      nextUnresolvedUtcDate: string | null;
      yesterdayUtcDate: string;
      requestedUtcDate: string | null;
      readerSummaryJobId: string | null;
      readerSummaryArtifactId: string | null;
      publicationId: string | null;
      reportSha256: string | null;
      proofSha256: string | null;
      weeklyEvidenceSha256: string | null;
      publicEvidenceSha256: string | null;
      publicFrontendSha256: string | null;
    }>(
      `SELECT
      (SELECT cursor.next_unresolved_utc_date::TEXT
       FROM public.reader_summary_daily_execution_cursors cursor
       WHERE cursor.tenant_id=$1::UUID AND cursor.workspace_id=$2::UUID)
        AS "nextUnresolvedUtcDate",
      ${recoveryThroughSql}::TEXT
        AS "yesterdayUtcDate",
      proof.requested_utc_date::TEXT AS "requestedUtcDate",
      proof.reader_summary_job_id::TEXT AS "readerSummaryJobId",
      proof.reader_summary_artifact_id::TEXT AS "readerSummaryArtifactId",
      proof.publication_id::TEXT AS "publicationId",
      proof.report_sha256 AS "reportSha256",
      proof.proof_sha256 AS "proofSha256",
      proof.weekly_evidence_sha256 AS "weeklyEvidenceSha256",
      proof.public_evidence_sha256 AS "publicEvidenceSha256",
      proof.public_frontend_sha256 AS "publicFrontendSha256"
    FROM (VALUES (1)) AS seed(singleton)
    LEFT JOIN (
      SELECT publication.requested_utc_date, job.id AS reader_summary_job_id,
        artifact.id AS reader_summary_artifact_id, publication.id AS publication_id,
        btrim(publication.report_sha256) AS report_sha256,
        btrim(publication.proof_sha256) AS proof_sha256,
        btrim(evidence.canonical_sha256) AS weekly_evidence_sha256,
        btrim(job.public_evidence_sha256) AS public_evidence_sha256,
        btrim(job.public_frontend_sha256) AS public_frontend_sha256
      FROM public.reader_summary_publications publication
      JOIN public.reader_summary_publication_slots slot
        ON slot.current_publication_id=publication.id
      JOIN public.reader_summary_weekly_publication_evidence evidence
        ON evidence.publication_id=publication.id
      JOIN public.reader_summary_jobs job
        ON job.id=publication.reader_summary_job_id
      JOIN public.reader_summary_artifacts artifact
        ON artifact.id=publication.reader_summary_artifact_id
      LEFT JOIN public."read_reader_summary_daily_delivery_c1_retry_evidence"(
        $1::UUID, $2::UUID
      ) retry ON retry.requested_utc_date=publication.requested_utc_date
      WHERE publication.tenant_id=$1::UUID AND publication.workspace_id=$2::UUID
        AND publication.cadence='daily'
        AND publication.requested_utc_date BETWEEN DATE '${dailyDeliveryC1FirstDate}'
          AND ${recoveryThroughSql}
        AND publication.semantic_status IN ('COMPLETED','NO_SIGNAL')
        AND job.status IN ('COMPLETED','NO_SIGNAL')
        AND artifact.status IN ('COMPLETED','NO_SIGNAL')
        AND btrim(publication.report_sha256) ~ '^[0-9a-f]{64}$'
        AND btrim(publication.proof_sha256) ~ '^[0-9a-f]{64}$'
        AND btrim(evidence.canonical_sha256) ~ '^[0-9a-f]{64}$'
        AND btrim(job.public_evidence_sha256) ~ '^[0-9a-f]{64}$'
        AND btrim(job.public_frontend_sha256) ~ '^[0-9a-f]{64}$'
        AND (publication.requested_utc_date NOT BETWEEN DATE '2026-07-25' AND DATE '2026-07-30'
          OR (retry.attempt_ordinal=2
            AND retry.reader_summary_job_id=job.id
            AND retry.reader_summary_artifact_id=artifact.id
            AND retry.publication_id=publication.id
            AND btrim(retry.publication_report_sha256)=btrim(publication.report_sha256)
            AND btrim(retry.publication_proof_sha256)=btrim(publication.proof_sha256)
            AND btrim(retry.weekly_evidence_sha256)=btrim(evidence.canonical_sha256)
            AND btrim(retry.public_evidence_sha256)=btrim(job.public_evidence_sha256)
            AND btrim(retry.public_frontend_sha256)=btrim(job.public_frontend_sha256)))
    ) proof ON TRUE
    ORDER BY proof.requested_utc_date NULLS FIRST`,
      frozenRecoveryThrough === undefined
        ? [scope.tenantId, scope.workspaceId]
        : [scope.tenantId, scope.workspaceId, frozenRecoveryThrough],
    );
    if (result.rows.length === 0) {
      throw new Error("Daily delivery C1 state query returned no row");
    }
    const first = result.rows[0]!;
    const terminalByDate = new Map(
      c0Terminals.map(
        (terminal) => [terminal.requestedUtcDate, terminal] as const,
      ),
    );
    const publicationBindings = result.rows.flatMap((row) => {
      const requestedUtcDate = row.requestedUtcDate;
      if (requestedUtcDate === null) return [];
      const publicationBinding = binding({ ...row, requestedUtcDate });
      if (!dailyDeliveryC1AdoptOnlyDates.includes(requestedUtcDate as never)) {
        return [publicationBinding];
      }
      const terminal = terminalByDate.get(requestedUtcDate);
      return terminal?.outcome === "FINALIZED" &&
        terminal.attemptOrdinal === null &&
        terminal.readerSummaryJobId === row.readerSummaryJobId &&
        terminal.readerSummaryArtifactId === row.readerSummaryArtifactId &&
        terminal.publicationId === row.publicationId &&
        terminal.reportSha256 === row.reportSha256 &&
        terminal.proofSha256 === row.proofSha256 &&
        terminal.weeklyEvidenceSha256 === row.weeklyEvidenceSha256 &&
        terminal.publicEvidenceSha256 === row.publicEvidenceSha256 &&
        terminal.publicFrontendSha256 === row.publicFrontendSha256
        ? [publicationBinding]
        : [];
    });
    const publishedDates = publicationBindings.map(
      (publication) => publication.requestedUtcDate,
    );
    if (new Set(publishedDates).size !== publishedDates.length) {
      throw new Error("Daily delivery C1 publication binding set is ambiguous");
    }
    await client.query("COMMIT");
    return {
      nextUnresolvedUtcDate: first.nextUnresolvedUtcDate,
      yesterdayUtcDate: first.yesterdayUtcDate,
      publishedDates,
      publicationBindings,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
};

export const writeDailyDeliveryC1RecoveryThroughFile = (
  path: string,
  recoveryThrough: string,
): void => {
  requireUtcDate(recoveryThrough, "recovery-through date");
  const bytes = Buffer.from(`${recoveryThrough}\n`, "utf8");
  writeFileSync(resolve(path), bytes, { flag: "wx", mode: 0o400 });
  chmodSync(resolve(path), 0o400);
  if (!readFileSync(resolve(path)).equals(bytes)) {
    throw new Error("Daily delivery C1 recovery-through handoff is invalid");
  }
};

const writeCaughtUpReceipt = (
  input: Readonly<{
    yesterdayUtcDate: string;
    publishedDates: readonly string[];
    publicationBindings: readonly DeliveryPublicationBinding[];
  }>,
): void => {
  const directory = resolve(required("READER_SUMMARY_DAILY_PUBLIC_DIRECTORY"));
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const requiredDates = dates(dailyDeliveryC1FirstDate, input.yesterdayUtcDate);
  const requiredSet = new Set(requiredDates);
  const publications = input.publicationBindings
    .filter((publication) => requiredSet.has(publication.requestedUtcDate))
    .slice()
    .sort((left, right) =>
      left.requestedUtcDate.localeCompare(right.requestedUtcDate),
    );
  if (
    publications.length !== requiredDates.length ||
    publications.some(
      (publication, index) =>
        publication.requestedUtcDate !== requiredDates[index],
    )
  ) {
    throw new Error("Daily delivery C1 receipt publication set is incomplete");
  }
  const receipt = {
    schemaVersion: "reader_summary.daily_delivery_caught_up.c1",
    firstRequiredUtcDate: dailyDeliveryC1FirstDate,
    eligibleThrough: input.yesterdayUtcDate,
    publishedDates: requiredDates,
    publications,
    publicationSetSha256: createHash("sha256")
      .update(JSON.stringify(publications), "utf8")
      .digest("hex"),
  };
  const path = resolve(
    directory,
    `reader-summary-daily-delivery-caught-up-c1-${input.yesterdayUtcDate}.json`,
  );
  const bytes = Buffer.from(`${JSON.stringify(receipt)}\n`, "utf8");
  try {
    if (readFileSync(path).equals(bytes)) {
      writeCaughtUpLatestPointer(directory, input.yesterdayUtcDate, bytes);
      return;
    }
    throw new Error("Daily delivery C1 CAUGHT_UP receipt conflicts");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  writeFileSync(path, bytes, { flag: "wx", mode: 0o444 });
  chmodSync(path, 0o444);
  writeCaughtUpLatestPointer(directory, input.yesterdayUtcDate, bytes);
};

const writeCaughtUpLatestPointer = (
  directory: string,
  eligibleThrough: string,
  receiptBytes: Buffer,
): void => {
  const latest = resolve(
    directory,
    "reader-summary-daily-delivery-caught-up-c1-latest.json",
  );
  const staged = `${latest}.${process.pid}.next`;
  const bytes = Buffer.from(
    `${JSON.stringify({
      schemaVersion: "reader_summary.daily_delivery_caught_up_pointer.c1",
      eligibleThrough,
      receiptSha256: createHash("sha256").update(receiptBytes).digest("hex"),
    })}\n`,
    "utf8",
  );
  try {
    writeFileSync(staged, bytes, { flag: "wx", mode: 0o444 });
    renameSync(staged, latest);
  } finally {
    rmSync(staged, { force: true });
  }
};

const binding = (row: {
  requestedUtcDate: string;
  readerSummaryJobId: string | null;
  readerSummaryArtifactId: string | null;
  publicationId: string | null;
  reportSha256: string | null;
  proofSha256: string | null;
  weeklyEvidenceSha256: string | null;
  publicEvidenceSha256: string | null;
  publicFrontendSha256: string | null;
}): DeliveryPublicationBinding => ({
  requestedUtcDate: row.requestedUtcDate,
  readerSummaryJobId: exact(row.readerSummaryJobId, "job id"),
  readerSummaryArtifactId: exact(row.readerSummaryArtifactId, "artifact id"),
  publicationId: exact(row.publicationId, "publication id"),
  reportSha256: exact(row.reportSha256, "report SHA-256"),
  proofSha256: exact(row.proofSha256, "proof SHA-256"),
  weeklyEvidenceSha256: exact(
    row.weeklyEvidenceSha256,
    "weekly evidence SHA-256",
  ),
  publicEvidenceSha256: exact(
    row.publicEvidenceSha256,
    "public evidence SHA-256",
  ),
  publicFrontendSha256: exact(
    row.publicFrontendSha256,
    "public frontend SHA-256",
  ),
});

const exact = (value: string | null, label: string): string => {
  if (value === null || value.length === 0) {
    throw new Error(`Daily delivery C1 ${label} is missing`);
  }
  return value;
};

const dates = (first: string, last: string): string[] => {
  if (first > last) return [];
  const result: string[] = [];
  for (let current = first; current <= last; current = addDay(current)) {
    result.push(current);
  }
  return result;
};
const addDay = (date: string): string =>
  new Date(Date.parse(`${date}T00:00:00.000Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);
const requireUtcDate = (value: string, label: string): void => {
  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(value) ||
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`Daily delivery C1 ${label} is invalid`);
  }
};
const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0)
    throw new Error(`${name} is required`);
  return value;
};
const requiredUtcDateEnv = (name: string): string => {
  const value = required(name);
  requireUtcDate(value, name);
  return value;
};

if (require.main === module) {
  const mode = process.argv[2];
  if (mode !== "precollect" && mode !== "verify-caught-up") {
    throw new Error("usage: delivery-c1 precollect|verify-caught-up");
  }
  void runDailyDeliveryC1(mode).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
