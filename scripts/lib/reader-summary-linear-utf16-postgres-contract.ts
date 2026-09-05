import type { PoolClient } from "pg";
import { performance } from "node:perf_hooks";
import { canonicalizeReaderSummaryWeeklyJson } from
  "@social-monitor/summary/domain/value-objects/reader-summary-weekly-canonical-json";
import { configureReaderSummaryPublicationDeadline } from
  "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-publication-deadline";
import { assertPostgres as assert } from "./reader-summary-publication-postgres-assertions";
import { dailyPublicationReport } from "./reader-summary-large-daily-publication-fixture";
import { stableJson, sha256 } from "./reader-summary-weekly-publication-evidence-postgres-contract";

export const assertLinearUtf16PostgresContract = async (client: PoolClient): Promise<void> => {
  const metadata = await client.query(`SELECT pg_get_userbyid(proowner) AS owner,
    proconfig, provolatile, proisstrict, proparallel
    FROM pg_proc WHERE oid = 'public.reader_summary_weekly_utf16_length(text)'::regprocedure`);
  const fn = metadata.rows[0];
  assert(fn.owner === "social_monitor_reader_summary_publication_owner" &&
    fn.provolatile === "i" && fn.proisstrict && fn.proparallel === "s" &&
    JSON.stringify(fn.proconfig) === JSON.stringify(["search_path=pg_catalog, public, pg_temp"]),
  "UTF16 owner, attributes or search_path changed");
  const privileges = await client.query(`SELECT has_function_privilege(
    'social_monitor_reader_summary_publication_runtime',
    'public.reader_summary_weekly_utf16_length(text)', 'EXECUTE') AS allowed`);
  assert(privileges.rows[0]?.allowed === false, "Runtime can execute private UTF16 helper");

  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL statement_timeout = '5s'");
    for (const value of [null, "", "ascii", "東京é", "e\u0301", "🚀", "👩‍💻",
      "\uFFFF\u{10000}\u{10FFFF}", "\b\f\n\r\t\"\\", "\u2028\u2029"]) {
      const row = await client.query<{ length: number | null }>(
        "SELECT public.reader_summary_weekly_utf16_length($1::text) AS length", [value]);
      assert(row.rows[0]?.length === (value === null ? null : value.length), "SQL UTF16 differs from JS.length");
      const canonical = canonicalizeReaderSummaryWeeklyJson(value);
      const result = await client.query(`SELECT public.reader_summary_weekly_canonical_json($1::jsonb) AS bytes`,
        [JSON.stringify(value)]);
      assert(result.rows[0].bytes === canonical.json && sha256(result.rows[0].bytes) === canonical.sha256,
        "Unicode canonical bytes or SHA changed");
    }
    const started = performance.now();
    const large = "🚀".repeat(100_000);
    const measured = await client.query<{ length: number }>(
      "SELECT public.reader_summary_weekly_utf16_length($1::text) AS length", [large]);
    assert(measured.rows[0]?.length === large.length, "Large UTF16 length differs");
    console.log(JSON.stringify({ utf16Units: large.length, elapsedMs: performance.now() - started }));
  } finally {
    await client.query("ROLLBACK");
  }
  await assertUnchangedDailyBounds(client);
};

const minimalArtifact = () => ({
  schemaVersion: "reader_summary.artifact.v1",
  period: { cadence: "daily", timezone: "UTC", startedAt: "2026-09-03T00:00:00.000Z",
    endedAt: "2026-09-04T00:00:00.000Z",
    periodKey: "daily:2026-09-03T00:00:00.000Z:2026-09-04T00:00:00.000Z:UTC" },
  lineage: { modelVersion: "synthetic", promptVersion: "synthetic" },
  headline: "Synthetic", executiveSummary: "Synthetic", citationMap: [],
});

const assertUnchangedDailyBounds = async (client: PoolClient): Promise<void> => {
  for (const length of [65_535, 65_536, 65_537]) {
    const value = "🚀".repeat(Math.floor(length / 2)) + (length % 2 ? "x" : "");
    const artifact = { ...minimalArtifact(), leaf: value };
    for (const [fn, payload] of [
      ["reader_summary_daily_artifact_canonical_json", artifact],
      ["reader_summary_daily_canonical_recovery_v4_report_canonical_json", dailyPublicationReport(artifact)],
    ] as const) {
      if (length <= 65_536) await assertCanonical(client, fn, payload);
      else await rejectCanonical(client, fn, payload, "structural bounds");
    }
  }
  for (const length of [16_383, 16_384, 16_385]) {
    const value = "🚀".repeat(Math.floor(length / 2)) + (length % 2 ? "x" : "");
    if (length <= 16_384) await assertCanonical(client, "reader_summary_weekly_canonical_json", value);
    else await rejectCanonical(client, "reader_summary_weekly_canonical_json", value, "structural bounds");
    if (length <= 16_384) await assertCanonical(client, "reader_summary_production_recovery_canonical_json", value);
    else await rejectCanonical(client, "reader_summary_production_recovery_canonical_json", value, "bound");
  }
  for (const period of [
    { ...minimalArtifact().period, cadence: "weekly" },
    { ...minimalArtifact().period, timezone: "Europe/London" },
    { ...minimalArtifact().period, periodKey: "wrong" },
    { ...minimalArtifact().period, startedAt: "2026-09-03T01:00:00.000Z" },
    { ...minimalArtifact().period, endedAt: "2026-09-05T00:00:00.000Z",
      periodKey: "daily:2026-09-03T00:00:00.000Z:2026-09-05T00:00:00.000Z:UTC" },
    { ...minimalArtifact().period, startedAt: "2026-02-30T00:00:00.000Z",
      periodKey: "daily:2026-02-30T00:00:00.000Z:2026-09-04T00:00:00.000Z:UTC" },
  ]) {
    const artifact = { ...minimalArtifact(), period, leaf: "x".repeat(16_385) };
    await rejectCanonical(client, "reader_summary_daily_artifact_canonical_json", artifact, "weekly canonical");
    await rejectCanonical(client, "reader_summary_daily_canonical_recovery_v4_report_canonical_json",
      dailyPublicationReport(artifact), "weekly canonical");
  }
  const nested = (depth: number): unknown => depth === 0 ? null : [nested(depth - 1)];
  for (const leaf of [nested(30), nested(31), Array(1023).fill(null), Array(1024).fill(null),
    Object.fromEntries(Array.from({ length: 128 }, (_, i) => [`k${i}`, null]))]) {
    await assertCanonical(client, "reader_summary_daily_artifact_canonical_json", { ...minimalArtifact(), leaf });
  }
  for (const leaf of [
    nested(32), Array(1025).fill(null),
    Object.fromEntries(Array.from({ length: 129 }, (_, i) => [`k${i}`, null])),
    Array.from({ length: 21 }, () => Array(1000).fill(null)),
    Array.from({ length: 200 }, () => Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`k${i}`, null]))),
    // >25K nodes while total keys and total array elements remain below 20K.
    Array.from({ length: 1000 }, () => ({ children: Array.from({ length: 13 }, () => ({ k: null })) })),
    Array.from({ length: 80 }, () => "x".repeat(60_000)),
  ]) {
    await rejectCanonical(client, "reader_summary_daily_artifact_canonical_json",
      { ...minimalArtifact(), leaf }, "bounds");
  }
  for (const fn of ["reader_summary_daily_artifact_canonical_json",
    "reader_summary_daily_canonical_recovery_v4_report_canonical_json"]) {
    await assertCanonical(client, fn, null);
    await rejectCanonical(client, fn, { schemaVersion: "invalid", leaf: "x".repeat(16_385) }, "weekly canonical");
  }
};

export const assertCanonical = async (client: PoolClient, fn: string, value: unknown): Promise<void> => {
  const result = await client.query<{ bytes: string; sha: string }>(
    `SELECT bytes, encode(sha256(convert_to(bytes, 'UTF8')), 'hex') AS sha
     FROM (SELECT public.${fn}($1::jsonb) AS bytes) canonical`, [JSON.stringify(value)]);
  const expected = stableJson(value);
  assert(result.rows[0]?.bytes === expected && result.rows[0].sha === sha256(expected),
    "Daily canonical bytes/SHA diverged from JS");
};

const rejectCanonical = async (client: PoolClient, fn: string, value: unknown, message: string): Promise<void> => {
  try {
    await client.query(`SELECT public.${fn}($1::jsonb)`, [JSON.stringify(value)]);
  } catch (error) {
    assert((error as { code?: string }).code === "P0001" &&
      error instanceof Error && error.message.includes(message), "Unexpected canonical rejection");
    return;
  }
  throw new Error("Canonical bound was widened");
};

export const assertPublicationDeadline = async (client: PoolClient): Promise<void> => {
  const setting = async (): Promise<string> =>
    (await client.query("SELECT setting FROM pg_settings WHERE name='statement_timeout'")).rows[0].setting;
  const original = await setting();
  await client.query("CREATE TEMP TABLE publication_deadline_probe (id integer)");
  try {
    for (const [initial, expected] of [[0, 300_000], [600_000, 300_000], [25, 25]]) {
      await client.query("SELECT set_config('statement_timeout', $1, false)", [String(initial)]);
      await client.query("BEGIN");
      try {
        await configureReaderSummaryPublicationDeadline({
          async $queryRaw<T>(sql: TemplateStringsArray, ...values: readonly unknown[]): Promise<T> {
            const text = sql.reduce((all, part, i) => all + (i ? `$${i}` : "") + part, "");
            return (await client.query(text, [...values])).rows as T;
          },
        });
        assert(await setting() === String(expected), "Server publication timeout is missing or widened");
        if (initial === 25) {
          await client.query("INSERT INTO publication_deadline_probe VALUES (1)");
          try {
            await client.query("SELECT pg_sleep(1)");
            throw new Error("Server deadline failed to cancel a running statement");
          } catch (error) {
            assert((error as { code?: string }).code === "57014", "Deadline did not cancel on server");
          }
        }
      } finally { await client.query("ROLLBACK"); }
      assert(await setting() === String(initial), "Deadline escaped its transaction");
      assert((await client.query("SELECT count(*)::int AS count FROM publication_deadline_probe"))
        .rows[0].count === 0, "Canceled publication transaction retained writes");
    }
  } finally {
    await client.query("SELECT set_config('statement_timeout', $1, false)", [original]);
    await client.query("DROP TABLE publication_deadline_probe");
  }
};
