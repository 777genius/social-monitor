/** Disposable PostgreSQL 18 recovery proof with synthetic provider clients. */
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Pool } from "pg";
import type { SourceProviderPort } from "@social-monitor/ingestion/ports";
import { PrismaIngestionWorkerConnection } from "../apps/ingestion-worker/src/adapters/persistence/prisma-ingestion-worker-connection";
import { executeRecoveryAcquisition } from "./lib/hn-rss-recovery-acquisition";
import { parseRecoveryArgs, type RecoveryProvider, type RecoveryRequest } from "./lib/hn-rss-recovery-plan";
import { syntheticHnIdForBinding, syntheticRecoveryProvider, syntheticRssGuidForBinding } from "./lib/hn-rss-recovery-synthetic-provider";
import { provisionReaderSummaryPublicationFixtureScope } from "./lib/reader-summary-publication-postgres-fixture-scope";
import { closeReaderSummaryPublicationPostgresContract, runReaderSummaryPublicationPostgresContract } from "./check-reader-summary-publication-postgres";
import { readBindingFromDatabase, runRecovery, type RecoveryDependencies } from "./run-hn-rss-recovery";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
type Scope = Readonly<{ tenantId: string; workspaceId: string; sourceBindingId: string; providerKey: RecoveryProvider }>;
const hnWindow = ["2026-09-23T16:00:00.000Z", "2026-09-23T17:00:00.000Z"] as const;
const rssWindow = ["2026-09-23T00:00:00.000Z", "2026-09-24T00:00:00.000Z"] as const;
const args = (scope: Scope, journal: string, from: string, to: string): string[] => [
  "--tenant-id", scope.tenantId, "--workspace-id", scope.workspaceId,
  "--source-binding-id", scope.sourceBindingId, "--provider", scope.providerKey,
  "--from", from, "--to", to, "--journal-dir", journal,
];

async function seedBinding(auditor: Pool, scope: { tenantId: string; workspaceId: string }, providerKey: RecoveryProvider): Promise<Scope> {
  const catalogId = randomUUID();
  const interestId = randomUUID();
  const sourceBindingId = randomUUID();
  await auditor.query(`INSERT INTO source_catalog_entries
    (id,provider_key,display_name,acquisition_mode,readiness,created_at,updated_at)
    VALUES ($1,$2,$3,'poll','READY',now(),now()) ON CONFLICT (provider_key) DO NOTHING`,
  [catalogId, providerKey, `Synthetic ${providerKey}`]);
  const catalog = await auditor.query<{ id: string }>("SELECT id::text FROM source_catalog_entries WHERE provider_key=$1", [providerKey]);
  const catalogEntry = catalog.rows[0];
  assert(catalogEntry, "Synthetic source catalog missing");
  await auditor.query(`INSERT INTO interests
    (id,tenant_id,workspace_id,name,query,status,created_at,updated_at)
    VALUES ($1,$2,$3,$4,'synthetic recovery','ENABLED',now(),now())`,
  [interestId, scope.tenantId, scope.workspaceId, `Synthetic ${interestId}`]);
  const config = providerKey === "rss"
    ? { feedUrl: "https://news.google.com/rss/search?q=synthetic%20when%3A1d", maxItems: 10 }
    : { mode: "search", query: "synthetic recovery", maxItems: 10 };
  await auditor.query(`INSERT INTO source_bindings
    (id,tenant_id,workspace_id,interest_id,source_catalog_entry_id,capability_profile_version,status,config,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,1,'ENABLED',$6::jsonb,now(),now())`,
  [sourceBindingId, scope.tenantId, scope.workspaceId, interestId, catalogEntry.id, JSON.stringify(config)]);
  await auditor.query(`INSERT INTO scan_policies
    (id,tenant_id,workspace_id,source_binding_id,interval_seconds,freshness_seconds,retry_budget,next_run_at,created_at,updated_at)
    VALUES ($1,$2,$3,$4,3600,3600,0,now(),now(),now())`,
  [randomUUID(), scope.tenantId, scope.workspaceId, sourceBindingId]);
  return { ...scope, sourceBindingId, providerKey };
}

async function child(mode: "run" | "crash", runtimeUrl: string, request: RecoveryRequest): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve, reject) => {
    const processArgs = [...args(request, request.journalDir, request.from, request.to), "--apply", "--plan-sha256", request.planSha256 ?? ""];
    const worker = spawn(process.execPath, ["-r", "ts-node/register/transpile-only", "-r", "tsconfig-paths/register",
      join(__dirname, "lib/hn-rss-recovery-postgres-worker.ts"), mode, ...processArgs], {
      cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"],
      env: { PATH: process.env.PATH ?? "", TZ: "UTC", TS_NODE_PROJECT: join(process.cwd(), "tsconfig.build.json"),
        HN_RSS_RECOVERY_SYNTHETIC_RUNTIME_URL: runtimeUrl },
    });
    let output = "";
    worker.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    worker.stderr.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    worker.on("error", reject);
    worker.on("close", (code) => resolve({ code, output }));
  });
}

async function proof(runtimeUrl: string, auditorUrl: string): Promise<void> {
  const journal = mkdtempSync(join(tmpdir(), "hn-rss-pg18-proof-"));
  const auditor = new Pool({ connectionString: auditorUrl, min: 0, max: 2 });
  let connection: PrismaIngestionWorkerConnection | undefined;
  try {
    connection = await PrismaIngestionWorkerConnection.createForProcess(runtimeUrl, "daily-runner");
    const activeConnection = connection;
    const fixtureScope = { tenantId: randomUUID(), workspaceId: randomUUID() };
    const seedClient = await auditor.connect();
    try { await provisionReaderSummaryPublicationFixtureScope(seedClient, fixtureScope); }
    finally { seedClient.release(); }
    const hn = await seedBinding(auditor, fixtureScope, "hacker-news");
    const rss = await seedBinding(auditor, fixtureScope, "rss");
    const cursorId = randomUUID();
    await auditor.query(`INSERT INTO cursor_checkpoints
      (id,tenant_id,workspace_id,source_binding_id,schema_version,cursor_payload,created_at,updated_at)
      VALUES ($1,$2,$3,$4,73,$5::jsonb,'2026-06-01T01:02:03Z','2026-06-02T04:05:06Z')`,
    [cursorId, hn.tenantId, hn.workspaceId, hn.sourceBindingId, JSON.stringify({ sentinel: "synthetic", version: 73 })]);
    const cursorBytes = async () => (await auditor.query<{ bytes: string }>(
      "SELECT row_to_json(t)::text AS bytes FROM (SELECT * FROM cursor_checkpoints WHERE id=$1) t", [cursorId])).rows[0]?.bytes;
    const beforeCursor = await cursorBytes();
    const oldJobId = randomUUID();
    await auditor.query(`INSERT INTO scan_jobs
      (id,tenant_id,workspace_id,source_binding_id,scan_policy_id,status,idempotency_key,requested_at,created_at,updated_at)
      SELECT $1,$2,$3,$4,id,'REQUESTED',$5,'2026-06-01T00:00:00Z','2026-06-01T00:00:00Z','2026-06-01T00:00:00Z'
      FROM scan_policies WHERE source_binding_id=$4`,
    [oldJobId, hn.tenantId, hn.workspaceId, hn.sourceBindingId, `synthetic-old-${oldJobId}`]);
    const oldJobBytes = async () => (await auditor.query<{ bytes: string }>(
      "SELECT row_to_json(t)::text AS bytes FROM (SELECT * FROM scan_jobs WHERE id=$1) t", [oldJobId])).rows[0]?.bytes;
    const beforeOldJob = await oldJobBytes();
    let acquisitions = 0;
    const dependencies: RecoveryDependencies = {
      readBinding: (request) => readBindingFromDatabase(request, runtimeUrl),
      acquire: async (request, binding, identity) => {
        acquisitions += 1;
        return executeRecoveryAcquisition({ connection: activeConnection, tenantId: request.tenantId, workspaceId: request.workspaceId,
          sourceBindingId: request.sourceBindingId, providerKey: request.providerKey, from: request.from, to: request.to,
          binding, ...identity, provider: syntheticRecoveryProvider(request.providerKey, request.sourceBindingId) });
      },
    };
    const plan = async (scope: Scope, from: string, to: string): Promise<RecoveryRequest> => {
      const request = parseRecoveryArgs(args(scope, journal, from, to), new Date());
      const result = await runRecovery(request, dependencies);
      assert(result.status === "PLAN", "Plan mode failed");
      return { ...request, apply: true, planSha256: String(result.planSha256) };
    };
    const firstPlan = await plan(hn, ...hnWindow);
    assert(acquisitions === 0 && readdirSync(journal).length === 0, "Plan mode acquired or reserved");
    for (const mismatch of [
      { ...firstPlan, tenantId: randomUUID() }, { ...firstPlan, workspaceId: randomUUID() },
      { ...firstPlan, providerKey: "rss" as const },
    ]) {
      await runRecovery(mismatch, dependencies).then(() => { throw new Error("Mismatched lookup accepted"); }, () => undefined);
    }
    await auditor.query("UPDATE source_bindings SET status='PAUSED' WHERE id=$1", [hn.sourceBindingId]);
    await runRecovery(firstPlan, dependencies).then(() => { throw new Error("Disabled binding accepted"); }, () => undefined);
    await auditor.query("UPDATE source_bindings SET status='ENABLED' WHERE id=$1", [hn.sourceBindingId]);
    assert(acquisitions === 0 && readdirSync(journal).length === 0, "Rejected lookup reached acquisition");

    const acquisitionNotBefore = new Date();
    const first = await runRecovery(firstPlan, dependencies);
    assert(first.status === "COMPLETED" && first.fetched === 1 && first.inserted === 1 && first.projected === 1, "HN first result incorrect");
    assert((await runRecovery(firstPlan, dependencies)).status === "ALREADY_COMPLETED" && acquisitions === 1, "Repeated plan reacquired");
    const overlap = await runRecovery(await plan(hn, "2026-09-23T16:15:00.000Z", "2026-09-23T17:15:00.000Z"), dependencies);
    assert(overlap.status === "COMPLETED" && overlap.fetched === 1 && overlap.inserted === 0 && overlap.skippedDuplicates === 1, "HN overlap counts incorrect");
    assert(await cursorBytes() === beforeCursor, "Success or overlap changed durable cursor");
    await runRecovery(parseRecoveryArgs(args(rss, journal, ...hnWindow), new Date()), dependencies)
      .then(() => { throw new Error("Intraday Google News accepted"); }, () => undefined);
    await runRecovery(parseRecoveryArgs(args(rss, journal,
      "2026-09-23T20:00:00.000Z", "2026-09-23T21:00:00.000Z"), new Date()), dependencies)
      .then(() => { throw new Error("Second intraday Google News slot accepted"); }, () => undefined);
    const rssPlan = await plan(rss, ...rssWindow);
    const rssResult = await runRecovery(rssPlan, dependencies);
    assert(rssResult.status === "COMPLETED" && rssResult.fetched === 1 && rssResult.inserted === 1, "RSS full-day result incorrect");
    assert((await runRecovery(rssPlan, dependencies)).status === "ALREADY_COMPLETED", "RSS repeated plan reacquired");

    const sources = await auditor.query<{ provider_key: string; provider_item_id: string; source_binding_id: string; observed_at: Date; count: string }>(
      `SELECT provider_key,provider_item_id,source_binding_id::text,min(observed_at) AS observed_at,count(*)::text AS count
       FROM source_items WHERE tenant_id=$1 AND workspace_id=$2 GROUP BY provider_key,provider_item_id,source_binding_id`,
    [hn.tenantId, hn.workspaceId]);
    assert(sources.rows.length === 2 &&
      sources.rows.some((row) => row.provider_key === "hacker-news" && row.provider_item_id === `hn:${syntheticHnIdForBinding(hn.sourceBindingId)}` && row.source_binding_id === hn.sourceBindingId && row.count === "1") &&
      sources.rows.some((row) => row.provider_key === "rss" && row.provider_item_id === syntheticRssGuidForBinding(rss.sourceBindingId) && row.source_binding_id === rss.sourceBindingId && row.count === "1"),
    "Canonical IDs or source uniqueness incorrect");
    const observationNotAfter = new Date();
    assert(sources.rows.every((row) => row.observed_at.getTime() >= acquisitionNotBefore.getTime() &&
      row.observed_at.getTime() <= observationNotAfter.getTime()),
      "Source observation was not current");
    const feed = await auditor.query<{ source_binding_id: string; source_provider_item_id: string; observed_at: Date }>(
      `SELECT f.source_binding_id::text, s.provider_item_id AS source_provider_item_id, f.observed_at
       FROM feed_items f JOIN source_items s ON s.id=f.source_item_id
       WHERE f.tenant_id=$1 AND f.workspace_id=$2`, [hn.tenantId, hn.workspaceId]);
    assert(feed.rows.length === 2 &&
      feed.rows.some((row) => row.source_binding_id === hn.sourceBindingId && row.source_provider_item_id === `hn:${syntheticHnIdForBinding(hn.sourceBindingId)}`) &&
      feed.rows.some((row) => row.source_binding_id === rss.sourceBindingId && row.source_provider_item_id === syntheticRssGuidForBinding(rss.sourceBindingId)),
    "Feed identity or source linkage incorrect");
    assert(feed.rows.every((row) => row.observed_at.getTime() >= acquisitionNotBefore.getTime() &&
      row.observed_at.getTime() <= observationNotAfter.getTime()),
      "Feed observation was not current");
    const jobs = await auditor.query<{ id: string; status: string }>("SELECT id::text,status::text FROM scan_jobs WHERE tenant_id=$1 AND workspace_id=$2", [hn.tenantId, hn.workspaceId]);
    const identities = [first, overlap, rssResult];
    for (const field of ["runId", "attemptId", "scanJobId"] as const) {
      assert(new Set(identities.map((value) => value[field])).size === identities.length &&
        identities.every((value) => typeof value[field] === "string" && /^[0-9a-f-]{36}$/i.test(String(value[field]))),
      `Recovery ${field} identities were reused or malformed`);
    }
    assert(jobs.rows.filter((row) => row.status === "SUCCEEDED").length === 3 &&
      [first.scanJobId, overlap.scanJobId, rssResult.scanJobId].every((id) => jobs.rows.some((row) => row.id === id && row.status === "SUCCEEDED")),
    "Real ExecuteScan job statuses absent");
    const attempts = await auditor.query<{ scan_job_id: string; status: string; fetched: number; inserted: number; skipped_duplicates: number; projected: number }>(
      "SELECT scan_job_id::text,status::text,fetched,inserted,skipped_duplicates,projected FROM scan_attempts WHERE tenant_id=$1 AND workspace_id=$2",
      [hn.tenantId, hn.workspaceId]);
    assert(identities.every((result) => attempts.rows.some((row) => row.scan_job_id === result.scanJobId &&
      row.status === "SUCCEEDED" && row.fetched === result.fetched && row.inserted === result.inserted &&
      row.skipped_duplicates === result.skippedDuplicates && row.projected === result.projected)),
    "Recovery identities or counts were not retained in real scan attempts");
    assert(await oldJobBytes() === beforeOldJob, "Old scan job changed");

    const ordinaryRss = await seedBinding(auditor, fixtureScope, "rss");
    await auditor.query("UPDATE source_bindings SET config=$2::jsonb WHERE id=$1",
      [ordinaryRss.sourceBindingId, JSON.stringify({ feedUrl: "https://example.test/ordinary-feed.xml", maxItems: 10 })]);
    const ordinaryRssResult = await runRecovery(await plan(ordinaryRss, ...hnWindow), dependencies);
    assert(ordinaryRssResult.status === "COMPLETED" && ordinaryRssResult.inserted === 1 &&
      await cursorBytes() === beforeCursor, "Ordinary RSS intraday support or cursor isolation failed");

    const samePlanBinding = await seedBinding(auditor, fixtureScope, "hacker-news");
    const samePlan = await plan(samePlanBinding, ...hnWindow);
    const [sameA, sameB] = await Promise.all([child("run", runtimeUrl, samePlan), child("run", runtimeUrl, samePlan)]);
    const sameStatuses = [sameA, sameB].map((result) => {
      if (result.code !== 0) return result.output.includes("SYNTHETIC_RESERVATION_REFUSED") ? "REFUSED" : "FAILED";
      return (JSON.parse(result.output.trim().split("\n").at(-1) ?? "{}") as { status: string }).status;
    });
    assert(sameStatuses.filter((status) => status === "COMPLETED").length === 1 &&
      sameStatuses.every((status) => ["COMPLETED", "ALREADY_COMPLETED", "REFUSED"].includes(status)) &&
      [sameA, sameB].flatMap((result) => result.output.split("\n")).filter((line) => line === "SYNTHETIC_ACQUIRE").length === 1,
    "Two processes acquired the same plan");
    const sameJobs = await auditor.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM scan_jobs WHERE source_binding_id=$1", [samePlanBinding.sourceBindingId]);
    assert(sameJobs.rows[0]?.count === "1", "Same-plan processes created multiple jobs");

    const concurrentBinding = await seedBinding(auditor, fixtureScope, "hacker-news");
    const concurrentPlans = await Promise.all([
      plan(concurrentBinding, ...hnWindow),
      plan(concurrentBinding, "2026-09-23T16:15:00.000Z", "2026-09-23T17:15:00.000Z"),
    ]);
    const concurrentResults = await Promise.allSettled(concurrentPlans.map((request) => runRecovery(request, dependencies)));
    assert(concurrentResults.some((result) => result.status === "fulfilled" && result.value.status === "COMPLETED"),
      "Concurrent overlapping plans had no completed acquisition");
    for (const [index, result] of concurrentResults.entries()) {
      if (result.status === "rejected") {
        assert(!existsSync(join(journal, `${concurrentPlans[index]?.planSha256}.completed.json`)),
          "Failed concurrent plan fabricated completion");
      }
    }
    const concurrentRows = await auditor.query<{ source_count: string; feed_count: string }>(
      `SELECT (SELECT count(*)::text FROM source_items WHERE source_binding_id=$1) AS source_count,
              (SELECT count(*)::text FROM feed_items WHERE source_binding_id=$1) AS feed_count`,
      [concurrentBinding.sourceBindingId]);
    assert(concurrentRows.rows[0]?.source_count === "1" && concurrentRows.rows[0]?.feed_count === "1",
      "Concurrent overlapping plans duplicated source/feed");
    const completedConcurrent = concurrentResults.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
    assert(completedConcurrent.every((result) => result.fetched === 1) &&
      completedConcurrent.reduce((sum, result) => sum + Number(result.inserted), 0) === 1 &&
      completedConcurrent.every((result) => Number(result.inserted) + Number(result.skippedDuplicates) === 1),
    "Concurrent overlapping plan counts were inconsistent");

    const leaseBinding = await seedBinding(auditor, fixtureScope, "hacker-news");
    const leasePlan = await plan(leaseBinding, ...hnWindow);
    const leaseConflictDependencies: RecoveryDependencies = {
      readBinding: dependencies.readBinding,
      acquire: async (request, binding, identity) => {
        await auditor.query(`INSERT INTO scan_leases
          (id,tenant_id,workspace_id,scan_job_id,worker_id,fencing_token,leased_at,expires_at)
          VALUES ($1,$2,$3,$4,'synthetic-conflict','synthetic-fence',now(),now()+interval '10 minutes')`,
        [randomUUID(), request.tenantId, request.workspaceId, identity.scanJobId]);
        return dependencies.acquire(request, binding, identity);
      },
    };
    await runRecovery(leasePlan, leaseConflictDependencies)
      .then(() => { throw new Error("Explicit lease conflict completed"); }, () => undefined);
    assert(existsSync(join(journal, `${leasePlan.planSha256}.started.json`)) &&
      !existsSync(join(journal, `${leasePlan.planSha256}.completed.json`)) && await cursorBytes() === beforeCursor,
    "Lease conflict did not remain incomplete or changed durable cursor");
    const leaseJobs = await auditor.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM scan_jobs WHERE source_binding_id=$1", [leaseBinding.sourceBindingId]);
    assert(leaseJobs.rows[0]?.count === "0", "Lease conflict fabricated a scan job");

    const warningBinding = await seedBinding(auditor, fixtureScope, "hacker-news");
    const warningPlan = await plan(warningBinding, ...hnWindow);
    const baseProvider = syntheticRecoveryProvider("hacker-news", warningBinding.sourceBindingId);
    const warningProvider: SourceProviderPort = {
      key: () => baseProvider.key(), capabilityProfile: () => baseProvider.capabilityProfile(),
      validateBinding: (query) => baseProvider.validateBinding(query),
      planScan: (query, context) => baseProvider.planScan(query, context),
      classifyError: (error, context) => baseProvider.classifyError(error, context),
      scan: async (scanPlan, context) => ({ ...await baseProvider.scan(scanPlan, context), warnings: ["synthetic comment enrichment degraded"] }),
    };
    await runRecovery(warningPlan, {
      readBinding: dependencies.readBinding,
      acquire: (request, binding, identity) => executeRecoveryAcquisition({ connection: activeConnection,
        tenantId: request.tenantId, workspaceId: request.workspaceId, sourceBindingId: request.sourceBindingId,
        providerKey: request.providerKey, from: request.from, to: request.to, binding, ...identity, provider: warningProvider }),
    }).then(() => { throw new Error("Partial provider completed"); }, () => undefined);
    assert(existsSync(join(journal, `${warningPlan.planSha256}.started.json`)) &&
      !existsSync(join(journal, `${warningPlan.planSha256}.completed.json`)) && await cursorBytes() === beforeCursor,
    "Partial provider outcome completed or changed durable cursor");
    const warningStarted = JSON.parse(readFileSync(join(journal, `${warningPlan.planSha256}.started.json`), "utf8")) as { scanJobId: string };
    const failedScan = await auditor.query<{ job_status: string; attempt_status: string }>(
      `SELECT j.status::text AS job_status, a.status::text AS attempt_status
       FROM scan_jobs j JOIN scan_attempts a ON a.scan_job_id=j.id WHERE j.id=$1`, [warningStarted.scanJobId]);
    assert(failedScan.rows[0]?.job_status === "FAILED" && failedScan.rows[0]?.attempt_status === "FAILED",
      "Partial provider was not recorded as a failed real scan");

    const crashBinding = await seedBinding(auditor, fixtureScope, "hacker-news");
    const crashPlan = await plan(crashBinding, ...hnWindow);
    const crashed = await child("crash", runtimeUrl, crashPlan);
    const startedPath = join(journal, `${crashPlan.planSha256}.started.json`);
    const completedPath = join(journal, `${crashPlan.planSha256}.completed.json`);
    process.stdout.write(`${JSON.stringify({ evidence: "synthetic_pg18_crash_process_snapshot",
      exitCode: crashed.code, started: existsSync(startedPath), completed: existsSync(completedPath) })}\n`);
    assert(crashed.code === 77 && existsSync(startedPath) && !existsSync(completedPath), "Crash did not retain STARTED uncertainty");
    const reservation = JSON.parse(readFileSync(startedPath, "utf8")) as { runId: string; attemptId: string; scanJobId: string };
    const committed = await auditor.query<{ status: string }>("SELECT status::text FROM scan_jobs WHERE id=$1", [reservation.scanJobId]);
    const committedItems = await auditor.query<{ source_count: string; feed_count: string }>(
      `SELECT (SELECT count(*)::text FROM source_items WHERE source_binding_id=$1) AS source_count,
              (SELECT count(*)::text FROM feed_items WHERE source_binding_id=$1) AS feed_count`,
      [crashBinding.sourceBindingId]);
    process.stdout.write(`${JSON.stringify({ evidence: "synthetic_pg18_crash_commit_snapshot",
      runId: reservation.runId, attemptId: reservation.attemptId, scanJobId: reservation.scanJobId,
      started: existsSync(startedPath), completed: existsSync(completedPath),
      scanJobStatus: committed.rows[0]?.status, sourceCount: committedItems.rows[0]?.source_count,
      feedCount: committedItems.rows[0]?.feed_count })}\n`);
    assert(committed.rows[0]?.status === "SUCCEEDED" && committedItems.rows[0]?.source_count === "1" &&
      committedItems.rows[0]?.feed_count === "1", "Crash did not follow actual DB commit");
    const callsBeforeRetry = acquisitions;
    await runRecovery(crashPlan, dependencies).then(() => { throw new Error("Uncertain retry reacquired"); }, () => undefined);
    assert(acquisitions === callsBeforeRetry && !existsSync(completedPath) && await cursorBytes() === beforeCursor &&
      await oldJobBytes() === beforeOldJob,
      "Uncertain retry acquired or changed durable state");
    process.stdout.write(`${JSON.stringify({ evidence: "synthetic_pg18_crash_before_receipt", started: true,
      completed: false, committedScanJobStatus: committed.rows[0]?.status, retryRefused: true,
      durableCursorUnchanged: true, oldJobUnchanged: true })}\n`);
    process.stdout.write("synthetic_pg18_recovery=PASS\n");
  } finally {
    try { await connection?.close(); } finally {
      try { await auditor.end(); } finally { rmSync(journal, { recursive: true, force: true }); }
    }
  }
}

void runReaderSummaryPublicationPostgresContract("publication", async (fixture) => {
  await proof(fixture.runtimeDatabaseUrl, fixture.auditorDatabaseUrl);
}).finally(closeReaderSummaryPublicationPostgresContract);
