/** Disposable, migrated local PostgreSQL proof. No live provider calls. */
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Pool } from "pg";
import { HackerNewsSourceProvider } from "@social-monitor/ingestion/adapters/source/hacker-news/hacker-news-source.provider";
import type { HackerNewsClientPort, HackerNewsStory } from "@social-monitor/ingestion/adapters/source/hacker-news/hacker-news-client.port";
import { SystemClock } from "@social-monitor/shared-kernel";

import { PrismaIngestionWorkerConnection } from "../apps/ingestion-worker/src/adapters/persistence/prisma-ingestion-worker-connection";
import { executeRecoveryAcquisition, type RecoveryBinding } from "./lib/hn-rss-recovery-acquisition";
import { parseRecoveryArgs } from "./lib/hn-rss-recovery-plan";
import { runRecovery, type RecoveryDependencies } from "./run-hn-rss-recovery";

const connectionString = process.env.HN_RSS_RECOVERY_TEST_DATABASE_URL;
if (connectionString === undefined) throw new Error("HN_RSS_RECOVERY_TEST_DATABASE_URL must identify a disposable migrated local database");
const url = new URL(connectionString);
if (!(["127.0.0.1", "localhost", "::1"].includes(url.hostname) && url.pathname === "/hn_rss_recovery_r3_test")) {
  throw new Error("PostgreSQL proof requires local database hn_rss_recovery_r3_test");
}

class SyntheticClient implements HackerNewsClientPort {
  async searchStories(): Promise<readonly HackerNewsStory[]> {
    return [{ kind: "story", id: 7654321, title: "Synthetic recovery proof", url: "https://example.test/synthetic-proof", time: Date.parse("2026-09-23T16:30:00Z") / 1000, score: 3 }];
  }
  async searchComments(): Promise<readonly HackerNewsStory[]> { return []; }
  async getStory(): Promise<HackerNewsStory | null> { return null; }
  async listStoryComments(): Promise<readonly HackerNewsStory[]> { return []; }
  async listStories(): Promise<readonly HackerNewsStory[]> { throw new Error("Live listing called in synthetic proof"); }
}

async function main(): Promise<void> {
  const tenant = randomUUID();
  const workspace = randomUUID();
  const bindingId = randomUUID();
  const binding: RecoveryBinding = { interestId: randomUUID(), scanPolicyId: randomUUID(), interestQuery: "synthetic proof", config: { mode: "search", query: "synthetic proof", maxItems: 10 } };
  const journalDir = mkdtempSync(join(tmpdir(), "hn-rss-r3-pg-proof-"));
  const connection = await PrismaIngestionWorkerConnection.createForProcess(connectionString!, "daily-runner");
  const pool = new Pool({ connectionString, max: 1 });
  try {
    const dependencies: RecoveryDependencies = {
      readBinding: async () => binding,
      acquire: (request, _binding, identity) =>
        executeRecoveryAcquisition({
          connection, tenantId: tenant, workspaceId: workspace, sourceBindingId: bindingId,
          providerKey: "hacker-news", from: request.from, to: request.to,
          binding, ...identity, provider: new HackerNewsSourceProvider(new SyntheticClient(), new SystemClock()),
        }),
    };
    const execute = async (from: string, to: string) => {
      const argv = ["--tenant-id", tenant, "--workspace-id", workspace, "--source-binding-id", bindingId, "--provider", "hacker-news", "--from", from, "--to", to, "--journal-dir", journalDir];
      const request = parseRecoveryArgs(argv, new Date());
      const plan = await runRecovery(request, dependencies);
      return runRecovery(parseRecoveryArgs([...argv, "--apply", "--plan-sha256", String(plan.planSha256)], new Date()), dependencies);
    };
    const first = await execute("2026-09-23T16:00:00.000Z", "2026-09-23T17:00:00.000Z");
    const second = await execute("2026-09-23T16:15:00.000Z", "2026-09-23T17:15:00.000Z");
    if (first.inserted !== 1 || second.inserted !== 0) throw new Error("Synthetic overlap source dedupe failed");
    const client = await pool.connect();
    try {
      await client.query("BEGIN READ ONLY");
      await client.query("SELECT set_config('social_monitor.tenant_id', $1, true), set_config('social_monitor.workspace_id', $2, true), set_config('social_monitor.system_access', 'false', true)", [tenant, workspace]);
      const source = await client.query<{ count: string; id: string; observed: Date }>("SELECT count(*)::text AS count, min(provider_item_id) AS id, min(observed_at) AS observed FROM source_items WHERE tenant_id=$1 AND workspace_id=$2", [tenant, workspace]);
      const feed = await client.query<{ count: string }>("SELECT count(*)::text AS count FROM feed_items WHERE tenant_id=$1 AND workspace_id=$2", [tenant, workspace]);
      const cursors = await client.query<{ count: string }>("SELECT count(*)::text AS count FROM cursor_checkpoints WHERE tenant_id=$1 AND workspace_id=$2", [tenant, workspace]);
      await client.query("COMMIT");
      if (source.rows[0]?.count !== "1" || source.rows[0]?.id !== "hn:7654321" || feed.rows[0]?.count !== "1" || cursors.rows[0]?.count !== "0") {
        throw new Error("Synthetic PostgreSQL source/feed/cursor proof failed");
      }
      if (source.rows[0]?.observed.getTime() < Date.parse("2026-09-24T00:00:00Z")) throw new Error("Recovery observation was backdated");
      process.stdout.write("synthetic_postgres_recovery=PASS\n");
    } finally { client.release(); }
  } finally {
    await pool.end();
    await connection.close();
    rmSync(journalDir, { recursive: true, force: true });
  }
}

void main();
