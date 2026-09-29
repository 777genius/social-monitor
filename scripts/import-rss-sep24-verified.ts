/** Explicit operator entrypoint. Reads only pinned files; write requires a finite DB role. */
import { createHash } from "node:crypto";
import { constants, type Stats } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import { Pool, type PoolClient } from "pg";

import { PrismaIngestionWorkerConnection } from "../apps/ingestion-worker/src/adapters/persistence/prisma-ingestion-worker-connection";
import { PrismaFeedProjectionAdapter } from "@social-monitor/feed/adapters/persistence/prisma/prisma-feed-projection.adapter";
import { PrismaScanAttemptRepository } from "@social-monitor/ingestion/adapters/persistence/prisma/prisma-scan-attempt.repository";
import { PrismaScanLeaseAdapter } from "@social-monitor/ingestion/adapters/persistence/prisma/prisma-scan-lease.adapter";
import { PrismaSourceItemRepository } from "@social-monitor/ingestion/adapters/persistence/prisma/prisma-source-item.repository";
import { runWithTenantDatabaseAccess } from "@social-monitor/platform-persistence";
import { CryptoIdGenerator, SystemClock, type TenantId, type WorkspaceId } from "@social-monitor/shared-kernel";
import { assertFiniteCollectionRole, scopedRead } from "./import-hn-verified-remainder";
import { importRssSep24Verified, planRssSep24Verified, RSS_SEP24_JOURNAL,
  type RssSep24Artifacts, type RssSep24Dependencies, type RssSep24PinnedScope, type RssSep24WriteDependencies,
  type RssSep24Scope } from "./recover-rss-sep24-verified";

const digestPattern = /^[a-f0-9]{64}$/u;
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const sha = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");
export type RssOperatorRequest = Readonly<{ inputRoot: string; expectedPinsSha256: string;
  expectedPlanSha256?: string; journalDir?: string; scope?: RssSep24Scope }>;

function absolute(value: unknown): string {
  if (typeof value !== "string" || !isAbsolute(value) || resolve(value) !== value) {
    throw new Error("Path must be explicit and absolute");
  }
  return value;
}
function digest(value: unknown): string {
  if (typeof value !== "string" || !digestPattern.test(value)) throw new Error("Missing or invalid SHA-256 pin");
  return value;
}
function privateDir(state: Stats, uid: number): boolean {
  return state.isDirectory() && !state.isSymbolicLink() && state.uid === uid && (state.mode & 0o077) === 0;
}
/** Root-owned sticky directories (such as /tmp) protect owned children from other users. */
export async function assertTrustedAncestry(path: string, uid: number): Promise<void> {
  let current = parse(path).root;
  for (const segment of relative(current, dirname(path)).split(sep).filter(Boolean)) {
    const state = await lstat(current);
    if (!state.isDirectory() || state.isSymbolicLink() || (state.uid !== 0 && state.uid !== uid) ||
      ((state.mode & 0o022) !== 0 && !(state.uid === 0 && (state.mode & 0o1777) === 0o1777))) {
      throw new Error("Path has an attacker-writable ancestor");
    }
    current = join(current, segment);
  }
  const state = await lstat(current);
  if (!state.isDirectory() || state.isSymbolicLink() || (state.uid !== 0 && state.uid !== uid) ||
    ((state.mode & 0o022) !== 0 && !(state.uid === 0 && (state.mode & 0o1777) === 0o1777))) {
    throw new Error("Path has an attacker-writable ancestor");
  }
  if ((await lstat(path)).uid !== uid) throw new Error("Path owner mismatch");
}
/** Every segment stays inside the private mount and the final file is opened without symlink following. */
async function pinnedFile(root: string, filename: string, uid: number, expected?: string): Promise<Buffer> {
  const path = join(root, filename);
  const child = relative(root, path);
  if (child === "" || child === ".." || child.startsWith(`..${sep}`) || isAbsolute(child) ||
    child.split(sep).some((part) => part === "." || part === "..")) throw new Error("Pinned input escapes mount");
  let current = root;
  const segments = child.split(sep);
  for (const [index, part] of segments.entries()) {
    current = join(current, part);
    const state = await lstat(current);
    if (state.isSymbolicLink() || state.uid !== uid || (state.mode & 0o077) !== 0 ||
      (index === segments.length - 1 ? !state.isFile() : !state.isDirectory())) {
      throw new Error("Pinned input must be a private regular file");
    }
  }
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  let bytes: Buffer;
  try {
    const state = await handle.stat();
    if (!state.isFile() || state.uid !== uid || (state.mode & 0o077) !== 0 || state.size > 8_000_000) {
      throw new Error("Pinned file changed or exceeds size limit");
    }
    bytes = await handle.readFile();
  } finally { await handle.close(); }
  if (expected !== undefined && sha(bytes) !== digest(expected)) throw new Error("Pinned input SHA-256 mismatch");
  return bytes;
}
function pinsObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Pin shape mismatch");
  const row = value as Record<string, unknown>;
  const keys = ["schemaVersion", "day", "scope", "bindingSha256", "manifestSha256", "itemsSha256"];
  if (Object.keys(row).sort().join("\0") !== keys.sort().join("\0")) throw new Error("Pin shape mismatch");
  return row;
}
export async function readRssSep24OperatorArtifacts(request: Pick<RssOperatorRequest, "inputRoot" | "expectedPinsSha256">,
  uid = 0): Promise<RssSep24Artifacts> {
  const root = absolute(request.inputRoot);
  await assertTrustedAncestry(root, uid);
  const state = await lstat(root);
  if (!privateDir(state, uid) || await realpath(root) !== root) throw new Error("Input root must be private and owned");
  const directory = await open(root, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    const anchoredRoot = `/proc/self/fd/${directory.fd}`;
    const original = await directory.stat();
    if (original.dev !== state.dev || original.ino !== state.ino) throw new Error("Input root changed during opening");
    const pinsBytes = await pinnedFile(anchoredRoot, "pins-rss-sep24.json", uid, digest(request.expectedPinsSha256));
    let parsed: unknown;
    try { parsed = JSON.parse(pinsBytes.toString("utf8")) as unknown; }
    catch { throw new Error("Pin file is not JSON"); }
    if (pinsBytes.toString("utf8") !== `${JSON.stringify(parsed, null, 2)}\n`) throw new Error("Pin file is not exact JSON");
    const pins = pinsObject(parsed);
    if (pins.schemaVersion !== 1 || pins.day !== "2026-09-24") throw new Error("Pinned day mismatch");
    if (pins.scope === null || typeof pins.scope !== "object" || Array.isArray(pins.scope)) {
      throw new Error("Pinned scope mismatch");
    }
    const pinnedScope = pins.scope as Record<string, unknown>;
    if (Object.keys(pinnedScope).sort().join("\0") !== ["tenantId", "workspaceId", "interestId",
      "sourceBindingId", "scanPolicyId"].sort().join("\0") ||
      Object.values(pinnedScope).some((id) => typeof id !== "string" || !uuidPattern.test(id))) {
      throw new Error("Pinned scope mismatch");
    }
    const expectedBindingSha256 = digest(pins.bindingSha256);
    const expectedManifestSha256 = digest(pins.manifestSha256);
    const expectedItemsSha256 = digest(pins.itemsSha256);
    const [bindingBytes, manifestBytes, itemsBytes] = await Promise.all([
      pinnedFile(anchoredRoot, "bindings-sanitized.json", uid, expectedBindingSha256),
      pinnedFile(anchoredRoot, "manifest.json", uid, expectedManifestSha256),
      pinnedFile(anchoredRoot, "items.json", uid, expectedItemsSha256),
    ]);
    const current = await lstat(root);
    if (current.dev !== original.dev || current.ino !== original.ino) throw new Error("Input root moved during read");
    return { pinnedScope: pinnedScope as unknown as RssSep24PinnedScope,
      bindingBytes, expectedBindingSha256, manifestBytes, expectedManifestSha256,
      itemsBytes, expectedItemsSha256 };
  } finally { await directory.close(); }
}

export function parseRssOperatorArgs(args: readonly string[]): { mode: "plan" | "write"; request: RssOperatorRequest } {
  const mode = args[0] === "--plan-only" ? "plan" : args[0] === "--write" ? "write" : undefined;
  if (mode === undefined) throw new Error("Choose --plan-only or --write");
  const found = new Map<string, string>();
  const allowed = mode === "plan" ? ["--input-root", "--pins-sha256"] : ["--input-root", "--pins-sha256",
    "--plan-sha256", "--journal-dir", "--tenant-id", "--workspace-id", "--interest-id", "--binding-id",
    "--scan-policy-id", "--correlation-id"];
  for (let index = 1; index < args.length; index += 2) {
    const key = args[index]; const value = args[index + 1];
    if (key === undefined || !allowed.includes(key) || value === undefined || value.length === 0 || found.has(key)) {
      throw new Error("Missing, duplicate or unsupported operator argument");
    }
    found.set(key, value);
  }
  if (found.size !== allowed.length) throw new Error("Missing operator argument");
  const get = (key: string): string => found.get(key)!;
  const base = { inputRoot: absolute(get("--input-root")), expectedPinsSha256: digest(get("--pins-sha256")) };
  if (mode === "plan") return { mode, request: base };
  const scope: RssSep24Scope = { tenantId: get("--tenant-id") as TenantId,
    workspaceId: get("--workspace-id") as WorkspaceId, interestId: get("--interest-id"),
    sourceBindingId: get("--binding-id"), scanPolicyId: get("--scan-policy-id"),
    correlationId: get("--correlation-id") };
  if ([scope.tenantId, scope.workspaceId, scope.interestId, scope.sourceBindingId,
    scope.scanPolicyId].some((id) => !uuidPattern.test(id)) ||
    !/^[a-zA-Z0-9._:-]{1,128}$/u.test(scope.correlationId)) throw new Error("Invalid operator scope");
  return { mode, request: { ...base, expectedPlanSha256: digest(get("--plan-sha256")),
    journalDir: absolute(get("--journal-dir")), scope } };
}

type QueryClient = Pick<PoolClient, "query">;
export async function verifyScopedRssRelation(pool: Pick<Pool, "connect">, scope: RssSep24Scope,
  feedUrl: string, config: string): Promise<boolean> {
  return scopedRead(pool, scope, async (client: QueryClient) => {
    const result = await client.query(`
      SELECT 1 FROM tenants t
      JOIN workspaces w ON w.tenant_id = t.id AND w.deleted_at IS NULL
      JOIN interests i ON i.tenant_id = t.id AND i.workspace_id = w.id
      JOIN source_bindings sb ON sb.tenant_id = t.id AND sb.workspace_id = w.id
        AND sb.interest_id = i.id AND sb.status = 'ENABLED' AND sb.deleted_at IS NULL
      JOIN source_catalog_entries sce ON sce.id = sb.source_catalog_entry_id AND sce.provider_key = 'rss'
      JOIN scan_policies sp ON sp.tenant_id = t.id AND sp.workspace_id = w.id AND sp.source_binding_id = sb.id
      WHERE t.id = $1::uuid AND t.deleted_at IS NULL AND w.id = $2::uuid
        AND i.id = $3::uuid AND i.status = 'ENABLED' AND i.deleted_at IS NULL
        AND sb.id = $4::uuid AND sp.id = $5::uuid
        AND COALESCE(sb.config->>'feedUrl', sb.config->>'url') = $6
        AND sb.config = $7::jsonb`, [scope.tenantId, scope.workspaceId, scope.interestId,
      scope.sourceBindingId, scope.scanPolicyId, feedUrl, config]);
    return result.rows.length === 1;
  });
}
const lockedRelationSql = `
      SELECT 1 FROM tenants t
      JOIN workspaces w ON w.tenant_id = t.id AND w.deleted_at IS NULL
      JOIN interests i ON i.tenant_id = t.id AND i.workspace_id = w.id
      JOIN source_bindings sb ON sb.tenant_id = t.id AND sb.workspace_id = w.id
        AND sb.interest_id = i.id AND sb.status = 'ENABLED' AND sb.deleted_at IS NULL
      JOIN source_catalog_entries sce ON sce.id = sb.source_catalog_entry_id AND sce.provider_key = 'rss'
      JOIN scan_policies sp ON sp.tenant_id = t.id AND sp.workspace_id = w.id AND sp.source_binding_id = sb.id
      WHERE t.id = $1::uuid AND t.deleted_at IS NULL AND w.id = $2::uuid
        AND i.id = $3::uuid AND i.status = 'ENABLED' AND i.deleted_at IS NULL
        AND sb.id = $4::uuid AND sp.id = $5::uuid
        AND COALESCE(sb.config->>'feedUrl', sb.config->>'url') = $6
        AND sb.config = $7::jsonb
      FOR SHARE OF t, w, i, sb, sce, sp`;
export async function findScopedRssIds(pool: Pick<Pool, "connect">, scope: RssSep24Scope,
  ids: readonly string[]): Promise<readonly string[]> {
  return scopedRead(pool, scope, async (client: QueryClient) => {
    const result = await client.query<{ providerItemId: string }>(`
      SELECT provider_item_id AS "providerItemId" FROM source_items
      WHERE tenant_id = $1::uuid AND workspace_id = $2::uuid AND provider_key = 'rss'
        AND provider_item_id = ANY($3::text[])`, [scope.tenantId, scope.workspaceId, ids]);
    return result.rows.map((row) => row.providerItemId);
  });
}
type RawTransaction = { $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T> };
type FiniteTransaction = PrismaIngestionWorkerConnection & RawTransaction;
/** The ordinary feed adapter keeps its mapping, but its update paths are disabled in this transaction. */
export function insertOnlyFeedTransaction<T extends { feedItem: object }>(tx: T): T {
  const feedItem = new Proxy(tx.feedItem, { get(target, property) {
    if (property === "update") return () => { throw new Error("Finite RSS feed projection refuses existing rows"); };
    if (property === "upsert") return async (args: { create: unknown }) => {
      const create = Reflect.get(target, "create") as ((args: { data: unknown }) => Promise<unknown>) | undefined;
      if (create === undefined) throw new Error("Finite RSS feed create unavailable");
      return create.call(target, { data: args.create });
    };
    return Reflect.get(target, property);
  } });
  return new Proxy(tx, { get(target, property) {
    return property === "feedItem" ? feedItem : Reflect.get(target, property);
  } });
}
export function createFiniteRssDependencies(connection: PrismaIngestionWorkerConnection): RssSep24Dependencies {
  const ids = new CryptoIdGenerator();
  return { withAtomicWrites: (scope, url, config, work) => connection.$transaction(async (transaction) => {
    const raw = transaction as unknown as FiniteTransaction;
    const role = await raw.$queryRawUnsafe<readonly { allowed: boolean }[]>(`
      SELECT (current_user = 'social_monitor_collection' AND r.rolcanlogin
        AND r.rolvaliduntil >= now() + interval '3 minutes'
        AND r.rolvaliduntil <= now() + interval '30 minutes') AS allowed
      FROM pg_roles r WHERE r.rolname = current_user`);
    if (role.length !== 1 || role[0]?.allowed !== true) throw new Error("Finite collection role is unavailable");
    const relation = await raw.$queryRawUnsafe<readonly unknown[]>(lockedRelationSql,
      scope.tenantId, scope.workspaceId, scope.interestId, scope.sourceBindingId, scope.scanPolicyId, url, config);
    if (relation.length !== 1) throw new Error("Current scoped RSS binding mismatch; journal remains started");
    const guarded = insertOnlyFeedTransaction(raw);
    const finite = new Proxy(guarded, { get(target, property) {
      if (property === "$transaction") return <T>(operation: (client: FiniteTransaction) => Promise<T>) => operation(finite);
      return Reflect.get(target, property);
    } }) as FiniteTransaction;
    const sourceItems = new PrismaSourceItemRepository(finite);
    const writes: RssSep24WriteDependencies = { verifyCurrentBinding: async () => true,
      findExistingExternalIds: async (readScope, values) => {
        if (readScope.tenantId !== scope.tenantId || readScope.workspaceId !== scope.workspaceId) {
          throw new Error("Finite RSS read scope changed");
        }
        const rows = await finite.$queryRawUnsafe<readonly { providerItemId: string }[]>(`
          SELECT provider_item_id AS "providerItemId" FROM source_items
          WHERE tenant_id = $1::uuid AND workspace_id = $2::uuid AND provider_key = 'rss'
            AND provider_item_id = ANY($3::text[])`, scope.tenantId, scope.workspaceId, values);
        return rows.map((row) => row.providerItemId);
      },
      sourceItems: { saveBatchInsertOnly: (command) => sourceItems.saveBatchInsertOnly(command) },
      feedProjection: new PrismaFeedProjectionAdapter(finite, ids),
      scanAttempts: new PrismaScanAttemptRepository(finite),
      scanLeases: new PrismaScanLeaseAdapter(finite, ids), ids, clock: new SystemClock() };
    return work(writes);
  }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 120000 }) };
}
export async function planRssOperator(request: RssOperatorRequest, uid = 0) {
  const plan = planRssSep24Verified(await readRssSep24OperatorArtifacts(request, uid));
  return { status: "PLAN_ONLY" as const, coverage: plan.coverage, day: plan.day,
    planSha256: plan.planSha256, selectedCount: plan.selectedCount, distinctCount: plan.distinctCount,
    scope: plan.scope,
    bindingSha256: plan.bindingSha256, manifestSha256: plan.manifestSha256, itemsSha256: plan.itemsSha256 };
}
type Runtime = Readonly<{ openSql: (url: string) => Pick<Pool, "connect" | "end">;
  openPrisma: (url: string) => Promise<PrismaIngestionWorkerConnection>; testOwnerUid?: number }>;
export async function runRssOperatorWithRuntime(request: RssOperatorRequest, databaseUrl: string, runtime: Runtime) {
  if (!databaseUrl || !request.expectedPlanSha256 || !request.journalDir || !request.scope) {
    throw new Error("Write requires finite external credential, plan, journal and scope");
  }
  const uid = runtime.testOwnerUid ?? 0;
  const journalDir = absolute(request.journalDir);
  await assertTrustedAncestry(journalDir, uid);
  const state = await lstat(journalDir);
  if (!privateDir(state, uid) || await realpath(journalDir) !== journalDir) throw new Error("Journal directory must be private");
  const journalDirectory = await open(journalDir, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    const opened = await journalDirectory.stat();
    if (opened.dev !== state.dev || opened.ino !== state.ino) throw new Error("Journal directory changed during opening");
    const artifacts = await readRssSep24OperatorArtifacts(request, uid);
    const plan = planRssSep24Verified(artifacts);
    if (plan.planSha256 !== request.expectedPlanSha256 ||
      Object.entries(plan.scope).some(([key, value]) => request.scope![key as keyof RssSep24PinnedScope] !== value)) {
      throw new Error("Pinned plan or binding mismatch");
    }
    const pool = runtime.openSql(databaseUrl);
    let connection: PrismaIngestionWorkerConnection | undefined;
    try {
      // Check the finite role on a scoped read before opening the domain writer.
      await scopedRead(pool, request.scope, (client) => assertFiniteCollectionRole(client));
      if (!await verifyScopedRssRelation(pool, request.scope, plan.feedUrl, plan.bindingConfig)) {
        throw new Error("Scoped RSS relation differs from pinned capture");
      }
      connection = await runtime.openPrisma(databaseUrl);
      return await runWithTenantDatabaseAccess(request.scope, () => importRssSep24Verified({ artifacts,
        expectedPlanSha256: request.expectedPlanSha256!, journalPath: join(journalDir, RSS_SEP24_JOURNAL),
        journalDirectory, scope: request.scope!, dependencies: createFiniteRssDependencies(connection!) }));
    } finally {
      try { await connection?.close(); }
      finally { await pool.end(); }
    }
  } finally { await journalDirectory.close(); }
}
export function finiteRssDatabaseUrl(databaseUrl: string): string {
  if (!databaseUrl) throw new Error("Write requires finite external credential");
  const boundedUrl = new URL(databaseUrl);
  boundedUrl.searchParams.set("statement_timeout", "20000");
  boundedUrl.searchParams.set("lock_timeout", "5000");
  boundedUrl.searchParams.set("query_timeout", "25000");
  return boundedUrl.toString();
}
export function runRssOperator(request: RssOperatorRequest, databaseUrl: string) {
  return runRssOperatorWithRuntime(request, finiteRssDatabaseUrl(databaseUrl), { openSql: (url) => new Pool({ connectionString: url,
    min: 0, max: 1, connectionTimeoutMillis: 5000, statement_timeout: 20000,
    lock_timeout: 5000, query_timeout: 25000 }),
    openPrisma: (url) => PrismaIngestionWorkerConnection.createForProcess(url, "daily-runner") });
}
if (require.main === module) {
  void (async () => {
    const { mode, request } = parseRssOperatorArgs(process.argv.slice(2));
    const receipt = mode === "plan" ? await planRssOperator(request) :
      await runRssOperator(request, process.env.DATABASE_URL ?? "");
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
  })().catch(() => { process.stderr.write("REFUSED_OR_UNCERTAIN\n"); process.exitCode = 2; });
}
