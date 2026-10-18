/** Retained RSS missing-only production entrypoint. */
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readFile, realpath, rename, type FileHandle } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';

import { PrismaFeedProjectionAdapter } from '@social-monitor/feed/adapters/persistence/prisma/prisma-feed-projection.adapter';
import { PrismaSourceItemRepository } from '@social-monitor/ingestion/adapters/persistence/prisma/prisma-source-item.repository';
import { SourceItem } from '@social-monitor/ingestion/domain/entities/source-item';
import { sanitizeFetchedSourceItem } from '@social-monitor/ingestion/features/execute-scan/scan-source-sanitization';
import { runWithTenantDatabaseAccess } from '@social-monitor/platform-persistence';
import { CryptoIdGenerator, SystemClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { PrismaIngestionWorkerConnection } from '../apps/ingestion-worker/src/adapters/persistence/prisma-ingestion-worker-connection';
import { insertOnlyFeedTransaction, assertTrustedAncestry, finiteRssDatabaseUrl, openFiniteOperatorSqlPool } from './import-rss-sep24-verified';
import { noRetryGitHubArchiveTransaction, writeExclusive } from './lib/github-archive-finite-journal';
import { assertFiniteGitHubArchiveRole } from './lib/github-archive-finite-role-policy';
import {
  archiveHash, canonicalJson, rssArchiveJournalReceipt,
  validateRssArchiveClaim, validateRssArchivePlanShape, type RssArchiveMissingPlan,
} from './lib/rss-archive-missing-policy';
import { executeRssArchiveMissingImport, type RssArchiveMissingDependencies } from './lib/rss-archive-missing-normalizer';

type Transaction = PrismaIngestionWorkerConnection & {
  $queryRawUnsafe: <T>(sql: string, ...args: unknown[]) => Promise<T>;
};
type RoleRow = Readonly<{ allowed: boolean }>;
function isRoleRow(value: unknown): value is RoleRow {
  return value !== null && typeof value === 'object' && 'allowed' in value &&
    typeof value.allowed === 'boolean';
}
function roleRows(value: readonly unknown[]): readonly RoleRow[] {
  const rows: RoleRow[] = [];
  for (const row of value) {
    if (!isRoleRow(row)) throw new Error('Finite collection role rows invalid');
    rows.push(row);
  }
  return rows;
}
export type RssArchiveMissingRequest = Readonly<{
  inputRoot: string; day: string; journalDir: string; semanticKey: string;
  expectedPlanSha256: string; packetSha256: string; correlationId: string;
}>;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
function need(value: unknown, reason: string): asserts value { if (!value) throw new Error(reason); }
function absolute(path: string): string {
  need(isAbsolute(path) && resolve(path) === path, 'RSS archive explicit absolute path required');
  return path;
}
async function directory(path: string, uid: number): Promise<FileHandle> {
  await assertTrustedAncestry(path, uid);
  const before = await lstat(path);
  need(before.isDirectory() && before.uid === uid && (before.mode & 0o7777) === 0o700 &&
    await realpath(path) === path, 'RSS archive private directory required');
  const handle = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  const after = await handle.stat();
  if (before.dev !== after.dev || before.ino !== after.ino) {
    await handle.close();
    throw new Error('RSS archive directory rebound');
  }
  return handle;
}
async function file(parent: FileHandle, name: string, uid: number, limit: number): Promise<Buffer> {
  need(/^[a-zA-Z0-9._-]+$/u.test(name), 'RSS archive fixed leaf required');
  const handle = await open(`/proc/self/fd/${parent.fd}/${name}`, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    need(before.isFile() && before.uid === uid && before.nlink === 1 &&
      (before.mode & 0o7777) === 0o600 && before.size > 0 && before.size <= limit,
      'RSS archive private input file required');
    const bytes = await handle.readFile(), after = await handle.stat();
    need(bytes.length === before.size && before.dev === after.dev && before.ino === after.ino &&
      before.size === after.size && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs,
      'RSS archive input changed');
    return bytes;
  } finally { await handle.close(); }
}
function packetPlan(packetBytes: Buffer, planBytes: Buffer, packetSha256: string): RssArchiveMissingPlan {
  need(archiveHash(packetBytes) === packetSha256, 'RSS packet pin mismatch');
  const packet = JSON.parse(packetBytes.toString('utf8')) as Record<string, unknown>;
  need(Object.keys(packet).sort().join(',') === ['schemaVersion','kind','day','providerKey','manifestSha256',
    'itemsSha256','scope','bindingConfig','bindingConfigSha256','selectedIds','items'].sort().join(','),
    'RSS packet shape mismatch');
  const scope = packet.scope as RssArchiveMissingPlan['scope'];
  const selectedIds = packet.selectedIds as string[];
  const unsigned = {
    schemaVersion: 1 as const, kind: 'rss-archive-missing.v1' as const,
    day: String(packet.day), providerKey: 'rss' as const,
    coverage: 'PARTIAL_ARCHIVED_OBSERVATIONS' as const,
    semanticKey: createHash('sha256').update(canonicalJson({
      kind: 'rss-archive-missing.v1', day: packet.day,
      itemsSha256: packet.itemsSha256, selectedIds,
    })).digest('hex'),
    packetSha256, manifestSha256: String(packet.manifestSha256),
    itemsSha256: String(packet.itemsSha256), scope,
    bindingConfig: String(packet.bindingConfig), bindingConfigSha256: String(packet.bindingConfigSha256),
    selectedIds, candidateIds: selectedIds,
  };
  const plan = { ...unsigned, planSha256: archiveHash(JSON.stringify(unsigned)) };
  need(canonicalJson(plan) === canonicalJson(JSON.parse(planBytes.toString('utf8'))),
    'RSS plan bytes do not match packet');
  validateRssArchivePlanShape(plan, plan.planSha256);
  need(Object.values(scope).every(value => typeof value === 'string' && uuid.test(value)), 'RSS scope invalid');
  return plan;
}
export async function readRssArchiveMissingPartition(
  request: Pick<RssArchiveMissingRequest, 'inputRoot' | 'day' | 'semanticKey' | 'packetSha256'>,
  uid = 0,
): Promise<{ plan: RssArchiveMissingPlan; items: unknown; journalFilename: string }> {
  const input = await directory(absolute(request.inputRoot), uid);
  try {
    const packetBytes = await file(input, 'packet.json', uid, 64 * 1024 * 1024);
    const planBytes = await file(input, 'plan.json', uid, 128 * 1024);
    const plan = packetPlan(packetBytes, planBytes, request.packetSha256);
    need(plan.day === request.day && plan.semanticKey === request.semanticKey &&
      plan.selectedIds.length <= 100, 'RSS recomputed identity/day mismatch');
    const items = (JSON.parse(packetBytes.toString('utf8')) as { items: unknown }).items;
    return { plan, items, journalFilename: `rss-archive-qualified-${plan.semanticKey}.journal.json` };
  } finally { await input.close(); }
}
function createDependencies(connection: PrismaIngestionWorkerConnection, plan: RssArchiveMissingPlan): RssArchiveMissingDependencies {
  const ids = new CryptoIdGenerator(), clock = new SystemClock();
  return {
    existingIds: async selected => {
      const rows = await (connection as unknown as Transaction).$queryRawUnsafe<readonly { providerItemId: string }[]>(`
        SELECT provider_item_id AS "providerItemId" FROM source_items
        WHERE tenant_id=$1::uuid AND workspace_id=$2::uuid AND provider_key='rss'
          AND provider_item_id=ANY($3::text[])`, plan.scope.tenantId, plan.scope.workspaceId, selected);
      return rows.map(row => row.providerItemId);
    },
    insertMissing: async fetched => {
      const scope = { ...plan.scope, tenantId: tenantId(plan.scope.tenantId), workspaceId: workspaceId(plan.scope.workspaceId) };
      const now = clock.now();
      const input = fetched.map(item => SourceItem.ingest({
        ...sanitizeFetchedSourceItem({
          ...item,
          metadata: { ...item.metadata, archiveImportObservedAt: now.toISOString() },
        }),
        id: ids.generate(), tenantId: scope.tenantId, workspaceId: scope.workspaceId,
        sourceBindingId: scope.sourceBindingId, ingestedAt: now,
      }));
      const saved = await new PrismaSourceItemRepository(connection).saveBatchInsertOnly({
        ...scope, providerKey: 'rss', items: input,
      });
      need(saved.inserted === input.length && saved.contentUpdated === 0 && saved.skippedDuplicates === 0,
        'RSS insert-only persistence uncertain');
      const relation = await (connection as unknown as Transaction).$queryRawUnsafe<readonly { interestQuery: string }[]>(`
        SELECT i.query AS "interestQuery" FROM tenants t JOIN workspaces w ON w.tenant_id=t.id
        JOIN interests i ON i.tenant_id=t.id AND i.workspace_id=w.id
        JOIN source_bindings b ON b.tenant_id=t.id AND b.workspace_id=w.id AND b.interest_id=i.id
        JOIN source_catalog_entries c ON c.id=b.source_catalog_entry_id
        JOIN scan_policies p ON p.tenant_id=t.id AND p.workspace_id=w.id AND p.source_binding_id=b.id
        WHERE t.id=$1::uuid AND w.id=$2::uuid AND i.id=$3::uuid AND b.id=$4::uuid AND p.id=$5::uuid
          AND c.provider_key='rss' AND b.config=$6::jsonb`,
        plan.scope.tenantId, plan.scope.workspaceId, plan.scope.interestId,
        plan.scope.sourceBindingId, plan.scope.scanPolicyId, plan.bindingConfig);
      need(relation.length === 1, 'RSS scoped binding changed');
      const projected = await new PrismaFeedProjectionAdapter(connection, ids).project({
        ...scope, providerKey: 'rss', sourceItems: saved.items.map(item => item.persistedItem),
        snapshots: {
          interestQuerySnapshot: { interestId: scope.interestId, query: relation[0]!.interestQuery },
          sourceBindingSnapshot: {
            sourceBindingId: scope.sourceBindingId, providerKey: 'rss',
            sourceQuery: { mode: 'listing', query: `rss-archive-missing.v1:${plan.semanticKey}` },
          },
          workspaceScopeSnapshot: { tenantId: scope.tenantId, workspaceId: scope.workspaceId },
        },
      });
      need(projected.projected === input.length, 'RSS feed projection uncertain');
      return saved.inserted;
    },
    present: async selected => {
      const rows = await (connection as unknown as Transaction).$queryRawUnsafe<readonly { present: number }[]>(`
        SELECT COUNT(DISTINCT provider_item_id)::int AS present FROM source_items
        WHERE tenant_id=$1::uuid AND workspace_id=$2::uuid AND provider_key='rss'
          AND provider_item_id=ANY($3::text[])`, plan.scope.tenantId, plan.scope.workspaceId, selected);
      return rows[0]?.present ?? 0;
    },
  };
}
function itemsFor(selected: Awaited<ReturnType<typeof readRssArchiveMissingPartition>>): unknown {
  return {
    generatedAt: '', jobId: 'retained-packet', window: { from: selected.plan.day, to: selected.plan.day },
    count: selected.plan.selectedIds.length, enrichedWithLink: 0,
    items: selected.items, itemsSha256: selected.plan.itemsSha256,
  };
}
export type RssArchiveMissingRuntime = Readonly<{
  openSql: (url: string) => Pick<ReturnType<typeof openFiniteOperatorSqlPool>, 'connect' | 'end'>;
  openPrisma: (url: string) => Promise<PrismaIngestionWorkerConnection>;
  testOwnerUid?: number;
}>;
export async function runRssArchiveMissingWithRuntime(
  request: RssArchiveMissingRequest, databaseUrl: string, runtime: RssArchiveMissingRuntime,
): Promise<Readonly<Record<string, unknown>>> {
  need(/^[a-f0-9]{64}$/u.test(request.expectedPlanSha256) &&
    /^[a-zA-Z0-9._:-]{1,128}$/u.test(request.correlationId), 'RSS exact plan/correlation required');
  const uid = runtime.testOwnerUid ?? 0;
  const selected = await readRssArchiveMissingPartition(request, uid);
  need(selected.plan.planSha256 === request.expectedPlanSha256, 'RSS recomputed plan mismatch');
  const journalDirectory = await directory(absolute(request.journalDir), uid);
  let sql: Pick<ReturnType<typeof openFiniteOperatorSqlPool>, 'connect' | 'end'> | undefined;
  let prisma: PrismaIngestionWorkerConnection | undefined;
  try {
    const url = finiteRssDatabaseUrl(databaseUrl);
    sql = runtime.openSql(url);
    const client = await sql.connect();
    try {
      await assertFiniteGitHubArchiveRole(async (text, values) => {
        const result = await client.query(text, [...values]);
        return roleRows(result.rows);
      }, selected.plan.scope, 'read');
    }
    finally { client.release(); }
    prisma = await runtime.openPrisma(url);
    const started = rssArchiveJournalReceipt({
      plan: selected.plan, coverage: selected.plan.coverage, status: 'started',
      inserted: 0, alreadyPresent: 0, postWritePresent: 0,
    });
    const name = selected.journalFilename;
    let existing: string | undefined;
    try { existing = await readFile(`/proc/self/fd/${journalDirectory.fd}/${name}`, 'utf8'); }
    catch { existing = undefined; }
    if (existing === undefined) {
      await writeExclusive(`/proc/self/fd/${journalDirectory.fd}/${name}`, started);
      await journalDirectory.sync();
    }
    const result = await runWithTenantDatabaseAccess(selected.plan.scope, () =>
      prisma!.$transaction(async tx => {
        const raw = tx as unknown as Transaction;
        await assertFiniteGitHubArchiveRole((text, values) => raw.$queryRawUnsafe(text, ...values), selected.plan.scope, 'write');
        const guarded = insertOnlyFeedTransaction(noRetryGitHubArchiveTransaction(raw));
        return executeRssArchiveMissingImport(selected.plan, itemsFor(selected),
          createDependencies(guarded as unknown as PrismaIngestionWorkerConnection, selected.plan), selected.plan.planSha256);
      }, { isolationLevel: 'Serializable', maxWait: 5000, timeout: 120000 }));
    const complete = rssArchiveJournalReceipt({
      plan: selected.plan, coverage: selected.plan.coverage, status: 'complete', ...result,
    });
    const temporary = `/proc/self/fd/${journalDirectory.fd}/${name}.${selected.plan.planSha256}.complete.tmp`;
    await writeExclusive(temporary, complete);
    await journalDirectory.sync();
    await rename(temporary, `/proc/self/fd/${journalDirectory.fd}/${name}`);
    await journalDirectory.sync();
    return complete;
  } finally {
    try { await prisma?.close(); }
    finally { try { await sql?.end(); } finally { await journalDirectory.close(); } }
  }
}
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  need(args.length === 9 && args[0] === '--native-write' && process.getuid?.() === 0,
    'RSS native root invocation required');
  const [, inputRoot, day, journalDir, semanticKey, expectedPlanSha256, packetSha256, correlationId, claimSha256] = args;
  need(/^[a-f0-9]{64}$/u.test(claimSha256!), 'RSS exact native claim digest required');
  const parent = await directory('/run/social-monitor', 0);
  let raw: Buffer;
  try { raw = await file(parent, 'rss-archive-import-claim.json', 0, 8192); }
  finally { await parent.close(); }
  need(archiveHash(raw) === claimSha256, 'RSS native claim changed');
  const plan = (await readRssArchiveMissingPartition({
    inputRoot: inputRoot!, day: day!, semanticKey: semanticKey!, packetSha256: packetSha256!,
  })).plan;
  validateRssArchiveClaim(JSON.parse(raw.toString('utf8')), plan);
  const receipt = await runRssArchiveMissingWithRuntime({
    inputRoot: inputRoot!, day: day!, journalDir: journalDir!, semanticKey: semanticKey!,
    expectedPlanSha256: expectedPlanSha256!, packetSha256: packetSha256!, correlationId: correlationId!,
  }, process.env.DATABASE_URL ?? '', {
    openSql: openFiniteOperatorSqlPool,
    openPrisma: url => PrismaIngestionWorkerConnection.createForProcess(url, 'daily-runner'),
  });
  process.stdout.write(JSON.stringify(receipt) + '\n');
}
if (require.main === module) {
  void main().catch(() => {
    process.stderr.write('RSS retained import refused; preserve journal and UNKNOWN; no retry\n');
    process.exitCode = 1;
  });
}
