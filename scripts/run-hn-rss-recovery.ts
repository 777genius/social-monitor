import { Pool, type PoolClient } from "pg";

import { PrismaIngestionWorkerConnection } from "../apps/ingestion-worker/src/adapters/persistence/prisma-ingestion-worker-connection";
import { executeRecoveryAcquisition, recoverySourceQuery, validateRecoveryWindow, type RecoveryBinding } from "./lib/hn-rss-recovery-acquisition";
import { assertPrivateJournalDir, completeRecovery, reserveRecovery } from "./lib/hn-rss-recovery-journal";
import { parseRecoveryArgs, recoveryPlan, sha256, type RecoveryRequest } from "./lib/hn-rss-recovery-plan";

export type RecoveryDependencies = Readonly<{
  readBinding: (request: RecoveryRequest) => Promise<RecoveryBinding>;
  acquire: (request: RecoveryRequest, binding: RecoveryBinding, identity: { runId: string; attemptId: string; scanJobId: string }) => Promise<{ fetched: number; inserted: number; projected: number; skippedDuplicates: number; warningCount: number }>;
}>;

export async function runRecovery(request: RecoveryRequest, dependencies: RecoveryDependencies): Promise<Readonly<Record<string, unknown>>> {
  assertPrivateJournalDir(request.journalDir);
  const binding = await dependencies.readBinding(request);
  recoverySourceQuery(request.providerKey, binding.config);
  validateRecoveryWindow(request.providerKey, binding.config, request.from, request.to, new Date());
  const plan = recoveryPlan(request, binding);
  const planSha256 = sha256(plan);
  if (!request.apply) {
    return { status: "PLAN", planSha256, ...plan, completeness: request.providerKey === "rss" ? "unknown_retained_feed_only" : "bounded_algolia_reachability_unknown" };
  }
  if (request.planSha256 !== planSha256) throw new Error("Plan changed since validation; no recovery effects started");
  const scope = {
    tenantId: request.tenantId,
    workspaceId: request.workspaceId,
    sourceBindingId: request.sourceBindingId,
    interestId: plan.interestId,
    scanPolicyId: plan.scanPolicyId,
    providerKey: request.providerKey,
    from: request.from,
    to: request.to,
    configSha256: plan.configSha256,
    interestQuerySha256: plan.interestQuerySha256,
  };
  const reserved = reserveRecovery(request.journalDir, planSha256, scope);
  if (reserved.kind === "completed") return { ...reserved.receipt, status: "ALREADY_COMPLETED", completeness: request.providerKey === "rss" ? "unknown_retained_feed_only" : "bounded_algolia_reachability_unknown" };
  const { reservation } = reserved;
  const result = await dependencies.acquire(request, binding, {
    runId: reservation.runId,
    attemptId: reservation.attemptId,
    scanJobId: reservation.scanJobId,
  });
  if (result.warningCount !== 0) throw new Error("Recovery acquisition was incomplete");
  const receipt = completeRecovery(request.journalDir, reservation, result);
  return { ...receipt, completeness: request.providerKey === "rss" ? "unknown_retained_feed_only" : "bounded_algolia_reachability_unknown" };
}

export async function readBindingFromDatabase(request: RecoveryRequest, databaseUrl: string): Promise<RecoveryBinding> {
  const pool = new Pool({ connectionString: databaseUrl, min: 0, max: 1, connectionTimeoutMillis: 5000 });
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query("BEGIN READ ONLY");
    await client.query("SELECT set_config('social_monitor.tenant_id', $1, true), set_config('social_monitor.workspace_id', $2, true), set_config('social_monitor.system_access', 'false', true)", [request.tenantId, request.workspaceId]);
    const result = await client.query<{
      interestId: string; scanPolicyId: string; interestQuery: string; config: unknown;
    }>(`
      SELECT sb.interest_id::text AS "interestId", sp.id::text AS "scanPolicyId",
        i.query AS "interestQuery", sb.config AS "config"
      FROM source_bindings sb
      JOIN interests i ON i.id = sb.interest_id AND i.tenant_id = sb.tenant_id AND i.workspace_id = sb.workspace_id
      JOIN source_catalog_entries sce ON sce.id = sb.source_catalog_entry_id
      JOIN scan_policies sp ON sp.source_binding_id = sb.id AND sp.tenant_id = sb.tenant_id AND sp.workspace_id = sb.workspace_id
      WHERE sb.id = $1::uuid AND sb.tenant_id = $2::uuid AND sb.workspace_id = $3::uuid
        AND sce.provider_key = $4 AND sb.status = 'ENABLED' AND sb.deleted_at IS NULL
        AND i.status = 'ENABLED' AND i.deleted_at IS NULL
    `, [request.sourceBindingId, request.tenantId, request.workspaceId, request.providerKey]);
    await client.query("COMMIT");
    if (result.rows.length !== 1) throw new Error("Recovery source binding, policy or scope is unavailable");
    const row = result.rows[0];
    if (row === undefined || row.config === null || typeof row.config !== "object" || Array.isArray(row.config)) throw new Error("Recovery source config is invalid");
    return { interestId: row.interestId, scanPolicyId: row.scanPolicyId, interestQuery: row.interestQuery, config: row.config as RecoveryBinding["config"] };
  } catch (error) {
    if (client !== undefined) await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client?.release();
    await pool.end();
  }
}

async function main(): Promise<void> {
  const request = parseRecoveryArgs(process.argv.slice(2), new Date());
  const databaseUrl = process.env.HN_RSS_RECOVERY_DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.length === 0) throw new Error("HN_RSS_RECOVERY_DATABASE_URL is required");
  const result = await runRecovery(request, {
    readBinding: (value) => readBindingFromDatabase(value, databaseUrl),
    acquire: async (value, binding, identity) => {
      const connection = await PrismaIngestionWorkerConnection.createForProcess(databaseUrl, "daily-runner");
      try {
        return await executeRecoveryAcquisition({
          connection, tenantId: value.tenantId, workspaceId: value.workspaceId,
          sourceBindingId: value.sourceBindingId, providerKey: value.providerKey,
          from: value.from, to: value.to, binding, ...identity,
        });
      } finally {
        await connection.close();
      }
    },
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    const kind = error instanceof Error ? error.message : "Unknown recovery failure";
    // Errors may include provider URLs or credentials; expose only an operator-safe category.
    const category = kind.includes("Plan changed") ? "PLAN_MISMATCH" : kind.includes("uncertain STARTED") ? "RECONCILE" : "REFUSED_OR_UNCERTAIN";
    process.stderr.write(`${category}: recovery did not reach a confirmed completion\n`);
    process.exitCode = category === "PLAN_MISMATCH" ? 3 : category === "RECONCILE" ? 4 : 2;
  });
}
