/** One campaign, one invocation. The finite credential and container deadline are host controls. */
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { Pool, type PoolClient } from "pg";

import { PrismaIngestionWorkerConnection } from "../apps/ingestion-worker/src/adapters/persistence/prisma-ingestion-worker-connection";
import { ConversationUnitProjectionAdapter } from "@social-monitor/conversation/adapters/ingestion/conversation-unit-projection.adapter";
import { PrismaConversationUnitRepository } from "@social-monitor/conversation/adapters/persistence/prisma/prisma-conversation-unit.repository";
import { PrismaFeedProjectionAdapter } from "@social-monitor/feed/adapters/persistence/prisma/prisma-feed-projection.adapter";
import { PrismaScanAttemptRepository } from "@social-monitor/ingestion/adapters/persistence/prisma/prisma-scan-attempt.repository";
import { PrismaScanLeaseAdapter } from "@social-monitor/ingestion/adapters/persistence/prisma/prisma-scan-lease.adapter";
import { PrismaSourceItemRepository } from "@social-monitor/ingestion/adapters/persistence/prisma/prisma-source-item.repository";
import { CryptoIdGenerator, SystemClock, type TenantId, type WorkspaceId } from "@social-monitor/shared-kernel";
import { runWithTenantDatabaseAccess } from "@social-monitor/platform-persistence";
import { importVerifiedHnRemainder, planVerifiedHnRemainder,
  type PinnedDayArtifact, type VerifiedHnImportDependencies, type VerifiedHnImportScope,
  type VerifiedRemainderInput, type VerifiedHnCampaign, sep28BindingSha256, sep28ManifestSha256,
  verifiedHnJournalName } from "./recover-hn-verified-remainder";

const digest = /^[a-f0-9]{64}$/u;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const sep28PinsSha256 = "25b3e45b2ead5fb6ecae9a4dcaa39ba6a51be6cb084dae419fd13a8de50ec871";
const hash = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

export type OperatorRequest = Readonly<{
  campaign?: VerifiedHnCampaign;
  inputRoot: string; pinsPath: string; expectedPlanSha256: string; journalDir: string;
  scope: VerifiedHnImportScope;
}>;

function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid pin shape");
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some((key) => !keys.includes(key)) || keys.some((key) => !(key in result))) {
    throw new Error("Invalid pin shape");
  }
  return result;
}

function exactDigest(value: unknown): string {
  if (typeof value !== "string" || !digest.test(value)) throw new Error("Missing or invalid SHA-256 pin");
  return value;
}

function exactPath(value: unknown): string {
  if (typeof value !== "string" || !isAbsolute(value) || resolve(value) !== value) {
    throw new Error("Input path must be explicit and absolute");
  }
  return value;
}

function dayDirectory(value: unknown): string {
  if (typeof value !== "string" || value.length > 128 || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u.test(value) ||
    value === "." || value === "..") throw new Error("Day pin directory must be a single name");
  return value;
}

/** No globbing, directory discovery, symlink traversal, or paths outside the one input mount. */
async function pinnedBytes(root: string, path: string, ownerUid: number, expected?: string): Promise<Buffer> {
  const name = exactPath(path);
  const child = relative(root, name);
  if (child === "" || child === ".." || child.startsWith(`..${sep}`) || isAbsolute(child)) {
    throw new Error("Pinned input escapes mount");
  }
  let parent = root;
  const segments = child.split(sep);
  for (const [index, segment] of segments.entries()) {
    parent = join(parent, segment);
    const state = await lstat(parent);
    if (state.isSymbolicLink() || state.uid !== ownerUid || (state.mode & 0o077) !== 0 ||
      (index === segments.length - 1 ? !state.isFile() : !state.isDirectory())) {
      throw new Error("Pinned input is not root-owned and private");
    }
  }
  const handle = await open(name, constants.O_RDONLY | constants.O_NOFOLLOW);
  let bytes: Buffer;
  try {
    const state = await handle.stat();
    if (!state.isFile() || state.uid !== ownerUid || (state.mode & 0o077) !== 0) {
      throw new Error("Pinned input changed during read");
    }
    bytes = await handle.readFile();
  } finally { await handle.close(); }
  if (expected !== undefined && hash(bytes) !== exactDigest(expected)) throw new Error("Pinned input SHA-256 mismatch");
  return bytes;
}

export async function readOperatorArtifacts(request: Pick<OperatorRequest, "inputRoot" | "pinsPath" | "campaign">,
  ownerUid = 0): Promise<VerifiedRemainderInput> {
  const campaign = request.campaign ?? "remainder";
  const root = exactPath(request.inputRoot);
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || rootStat.uid !== ownerUid ||
    (rootStat.mode & 0o077) !== 0 || await realpath(root) !== root) {
    throw new Error("Input mount must be a private root-owned directory");
  }
  if (request.pinsPath !== join(root, campaign === "sep28" ? "pins-hn-sep28.json" : "pins-20260928.json")) {
    throw new Error("Unexpected pins path");
  }
  const pinsBytes = await pinnedBytes(root, request.pinsPath, ownerUid);
  if (campaign === "sep28" && hash(pinsBytes) !== sep28PinsSha256) throw new Error("Sep28 pins SHA-256 mismatch");
  const pins = object(JSON.parse(pinsBytes.toString("utf8")) as unknown,
    ["schemaVersion", "bindingSha256", "days"]);
  if (pins.schemaVersion !== 1 || !Array.isArray(pins.days) ||
    pins.days.length !== (campaign === "sep28" ? 1 : 8)) {
    throw new Error("Explicit campaign day pins are required");
  }
  const bindingSha256 = exactDigest(pins.bindingSha256);
  if (campaign === "sep28" && bindingSha256 !== sep28BindingSha256) throw new Error("Sep28 binding pin mismatch");
  const days: PinnedDayArtifact[] = [];
  for (const [index, raw] of pins.days.entries()) {
    const pin = object(raw, ["day", "directory", "manifestSha256"]);
    const day = campaign === "sep28" ? "2026-09-28" : `2026-09-${String(index + 20)}`;
    if (pin.day !== day) throw new Error("Day pin path or order mismatch");
    const directory = join(root, dayDirectory(pin.directory));
    const manifestSha256 = exactDigest(pin.manifestSha256);
    if (campaign === "sep28" && (manifestSha256 !== sep28ManifestSha256 ||
      pin.directory !== "sep28-final-r1")) throw new Error("Sep28 public artifact pin mismatch");
    const manifestBytes = await pinnedBytes(root, join(directory, "manifest.json"), ownerUid, manifestSha256);
    const manifest = JSON.parse(manifestBytes.toString("utf8")) as unknown;
    if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) {
      throw new Error("Day manifest shape mismatch");
    }
    const fields = manifest as Record<string, unknown>;
    if (fields.day !== day || fields.bindingSha256 !== bindingSha256 || fields.itemsFile !== "items.json") {
      throw new Error("Day manifest binding or day mismatch");
    }
    const itemsBytes = await pinnedBytes(root, join(directory, "items.json"), ownerUid,
      exactDigest(fields.itemsSha256));
    days.push({ day, expectedManifestSha256: manifestSha256, manifestBytes, itemsBytes });
  }
  const bindingBytes = await pinnedBytes(root, join(root, "bindings-sanitized.json"), ownerUid, bindingSha256);
  return { campaign, bindingBytes, expectedBindingSha256: bindingSha256, days };
}

export function parseOperatorArgs(args: readonly string[], campaign: VerifiedHnCampaign = "remainder"): OperatorRequest {
  const names = ["--input-root", "--pins", "--plan-sha256", "--journal-dir", "--tenant-id",
    "--workspace-id", "--interest-id", "--binding-id", "--scan-policy-id", "--correlation-id"];
  const found = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (key === undefined || !names.includes(key) || value === undefined || value.length === 0 || found.has(key)) {
      throw new Error("Missing, duplicated or unsupported operator argument");
    }
    found.set(key, value);
  }
  if (found.size !== names.length) throw new Error("Missing operator argument");
  const get = (key: string): string => found.get(key)!;
  const scope: VerifiedHnImportScope = {
    tenantId: get("--tenant-id") as TenantId, workspaceId: get("--workspace-id") as WorkspaceId,
    interestId: get("--interest-id"), sourceBindingId: get("--binding-id"),
    scanPolicyId: get("--scan-policy-id"), correlationId: get("--correlation-id"),
  };
  if ([scope.tenantId, scope.workspaceId, scope.interestId, scope.sourceBindingId,
    scope.scanPolicyId].some((id) => !uuid.test(id)) || !/^[a-zA-Z0-9._:-]{1,128}$/u.test(scope.correlationId)) {
    throw new Error("Invalid operator scope");
  }
  return { campaign, inputRoot: exactPath(get("--input-root")), pinsPath: exactPath(get("--pins")),
    expectedPlanSha256: exactDigest(get("--plan-sha256")),
    journalDir: exactPath(get("--journal-dir")), scope };
}

type QueryClient = Pick<PoolClient, "query">;

/** Server time and current_user are checked on the same SQL session used for scoped reads. */
export async function assertFiniteCollectionRole(client: QueryClient): Promise<void> {
  const result = await client.query<{ allowed: boolean }>(`
    SELECT (current_user = 'social_monitor_collection' AND r.rolcanlogin
      AND r.rolvaliduntil IS NOT NULL AND r.rolvaliduntil > now()
      AND r.rolvaliduntil <= now() + interval '30 minutes') AS allowed
    FROM pg_roles r WHERE r.rolname = current_user`);
  if (result.rows.length !== 1 || result.rows[0]?.allowed !== true) {
    throw new Error("Finite collection role is unavailable");
  }
}

export async function scopedRead<T>(pool: Pick<Pool, "connect">, scope: VerifiedHnImportScope,
  read: (client: QueryClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await assertFiniteCollectionRole(client);
    await client.query("SELECT set_config('social_monitor.tenant_id', $1, true), set_config('social_monitor.workspace_id', $2, true), set_config('social_monitor.system_access', 'false', true)",
      [scope.tenantId, scope.workspaceId]);
    const value = await read(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

export async function verifyCurrentRelation(pool: Pick<Pool, "connect">,
  scope: VerifiedHnImportScope, query: string, config?: string): Promise<boolean> {
  return scopedRead(pool, scope, async (client) => {
    const result = await client.query<{ matched: number }>(`
      SELECT 1 AS matched FROM tenants t
      JOIN workspaces w ON w.tenant_id = t.id AND w.deleted_at IS NULL
      JOIN interests i ON i.tenant_id = t.id AND i.workspace_id = w.id
      JOIN source_bindings sb ON sb.tenant_id = t.id AND sb.workspace_id = w.id
        AND sb.interest_id = i.id AND sb.status = 'ENABLED' AND sb.deleted_at IS NULL
      JOIN source_catalog_entries sce ON sce.id = sb.source_catalog_entry_id
        AND sce.provider_key = 'hacker-news'
      JOIN scan_policies sp ON sp.tenant_id = t.id AND sp.workspace_id = w.id
        AND sp.source_binding_id = sb.id
      WHERE t.id = $1::uuid AND t.deleted_at IS NULL AND w.id = $2::uuid
        AND i.status = 'ENABLED' AND i.deleted_at IS NULL
        AND i.id = $3::uuid AND sb.id = $4::uuid AND sp.id = $5::uuid
        AND sb.config->>'query' = $6
        ${config === undefined ? "" : "AND sb.config = $7::jsonb"}`,
      [scope.tenantId, scope.workspaceId, scope.interestId, scope.sourceBindingId,
        scope.scanPolicyId, query, ...(config === undefined ? [] : [config])]);
    return result.rows.length === 1;
  });
}

export async function findScopedExistingIds(pool: Pick<Pool, "connect">,
  scope: VerifiedHnImportScope, ids: readonly string[]): Promise<readonly string[]> {
  return scopedRead(pool, scope, async (client) => {
    const result = await client.query<{ providerItemId: string }>(`
      SELECT provider_item_id AS "providerItemId" FROM source_items
      WHERE tenant_id = $1::uuid AND workspace_id = $2::uuid
        AND provider_key = 'hacker-news'
        AND provider_item_id = ANY($3::text[])`,
      [scope.tenantId, scope.workspaceId, ids]);
    return result.rows.map((row) => row.providerItemId);
  });
}

/** Only a Prisma connection can be supplied; this composition creates its own insert-only entrypoint. */
export function composeImportDependencies(connection: PrismaIngestionWorkerConnection,
  pool: Pick<Pool, "connect">): VerifiedHnImportDependencies {
  const ids = new CryptoIdGenerator();
  const sourceItems = new PrismaSourceItemRepository(connection);
  return {
    verifyCurrentBinding: (scope, query, config) => verifyCurrentRelation(pool, scope, query, config),
    findExistingExternalIds: (scope, externalIds) => findScopedExistingIds(pool, scope, externalIds),
    sourceItems: { saveBatchInsertOnly: (command) => sourceItems.saveBatchInsertOnly(command) },
    feedProjection: new PrismaFeedProjectionAdapter(connection, ids),
    conversationProjection: new ConversationUnitProjectionAdapter(
      new PrismaConversationUnitRepository(connection, ids), ids),
    scanAttempts: new PrismaScanAttemptRepository(connection),
    scanLeases: new PrismaScanLeaseAdapter(connection, ids), ids, clock: new SystemClock(),
  };
}

/** Explicit allowlist prevents future importer fields from entering operator output. */
export function redactedOperatorReceipt(result: { readonly planSha256: string; readonly inserted: number;
  readonly alreadyPresent: number }, campaign: VerifiedHnCampaign = "remainder"):
  { readonly status: "COMPLETE"; readonly planSha256: string;
    readonly inserted: number; readonly alreadyPresent: number;
    readonly coverage?: "PARTIAL_SOURCE_ONLY"; readonly sourceStatus?: "incomplete" } {
  return { status: "COMPLETE", planSha256: result.planSha256,
    inserted: result.inserted, alreadyPresent: result.alreadyPresent,
    ...(campaign === "sep28" ? { coverage: "PARTIAL_SOURCE_ONLY" as const,
      sourceStatus: "incomplete" as const } : {}) };
}

type OperatorRuntime = Readonly<{
  openSql: (databaseUrl: string) => Pick<Pool, "connect" | "end">;
  openPrisma: (databaseUrl: string) => Promise<PrismaIngestionWorkerConnection>;
  /** Disposable tests use their own private directory; the product entrypoint always requires UID 0. */
  testOwnerUid?: number;
}>;

export async function runVerifiedHnOperatorWithRuntime(request: OperatorRequest, databaseUrl: string,
  runtime: OperatorRuntime): Promise<{
  status: "COMPLETE"; planSha256: string; inserted: number; alreadyPresent: number;
  coverage?: "PARTIAL_SOURCE_ONLY"; sourceStatus?: "incomplete";
}> {
  if (!databaseUrl) throw new Error("Collection database URL is unavailable");
  const ownerUid = runtime.testOwnerUid ?? 0;
  const journalDir = exactPath(request.journalDir);
  const journal = await lstat(journalDir);
  if (!journal.isDirectory() || journal.isSymbolicLink() || journal.uid !== ownerUid ||
    (journal.mode & 0o077) !== 0 || await realpath(journalDir) !== journalDir) {
    throw new Error("Journal directory must be root-only");
  }
  const artifacts = await readOperatorArtifacts(request, ownerUid);
  const plan = planVerifiedHnRemainder(artifacts);
  if (plan.planSha256 !== request.expectedPlanSha256 || plan.bindingId !== request.scope.sourceBindingId) {
    throw new Error("Pinned plan or binding mismatch");
  }
  const pool = runtime.openSql(databaseUrl);
  let connection: PrismaIngestionWorkerConnection | undefined;
  try {
    // Both gates complete before the importer can create its exclusive journal or domain writes.
    const bindingConfig = request.campaign === "sep28"
      ? JSON.stringify((JSON.parse(artifacts.bindingBytes.toString("utf8")) as { config: unknown }[])[0]?.config)
      : undefined;
    if (!await verifyCurrentRelation(pool, request.scope, plan.bindingQuery, bindingConfig)) {
      throw new Error("Scoped HN relation does not match pinned binding");
    }
    const prismaConnection = await runtime.openPrisma(databaseUrl);
    connection = prismaConnection;
    const result = await runWithTenantDatabaseAccess(request.scope, () =>
      importVerifiedHnRemainder({ artifacts, expectedPlanSha256: request.expectedPlanSha256,
        journalPath: join(journalDir, verifiedHnJournalName(request.campaign ?? "remainder")), scope: request.scope,
        dependencies: composeImportDependencies(prismaConnection, pool) }));
    return redactedOperatorReceipt(result, request.campaign);
  } finally {
    await connection?.close();
    await pool.end();
  }
}

export function runVerifiedHnOperator(request: OperatorRequest, databaseUrl: string) {
  return runVerifiedHnOperatorWithRuntime(request, databaseUrl, {
    openSql: (url) => new Pool({ connectionString: url, min: 0, max: 1, connectionTimeoutMillis: 5000 }),
    openPrisma: (url) => PrismaIngestionWorkerConnection.createForProcess(url, "daily-runner"),
  });
}

if (require.main === module) {
  void (async () => {
    const request = parseOperatorArgs(process.argv.slice(2));
    const receipt = await runVerifiedHnOperator(request, process.env.DATABASE_URL ?? "");
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
  })().catch(() => {
    // Provider bytes, query, connection details and SQL errors never reach the terminal.
    process.stderr.write("REFUSED_OR_UNCERTAIN\n");
    process.exitCode = 2;
  });
}
