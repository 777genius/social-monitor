/** Retained Hacker News missing-only production entrypoint. */
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readFile, realpath, rename, type FileHandle } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';

import { ConversationUnitProjectionAdapter } from '@social-monitor/conversation/adapters/ingestion/conversation-unit-projection.adapter';
import { PrismaConversationUnitRepository } from '@social-monitor/conversation/adapters/persistence/prisma/prisma-conversation-unit.repository';
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
  archiveHash, canonicalJson, hnArchiveJournalReceipt, validateHnArchiveClaim,
  validateHnArchivePlanShape, type HnArchiveMissingPlan,
} from './lib/hn-archive-missing-policy';
import { executeHnArchiveMissingImport, type HnArchiveMissingDependencies } from './lib/hn-archive-missing-normalizer';

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
export type HnArchiveMissingRequest = Readonly<{
  inputRoot: string; day: string; journalDir: string; semanticKey: string;
  expectedPlanSha256: string; packetSha256: string; correlationId: string;
}>;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
function need(value: unknown, reason: string): asserts value { if (!value) throw new Error(reason); }
function absolute(path: string): string {
  need(isAbsolute(path) && resolve(path) === path, 'HN archive explicit absolute path required');
  return path;
}
async function directory(path: string, uid: number): Promise<FileHandle> {
  await assertTrustedAncestry(path, uid);
  const before = await lstat(path);
  need(before.isDirectory() && before.uid === uid && (before.mode & 0o7777) === 0o700 &&
    await realpath(path) === path, 'HN archive private directory required');
  const handle = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  const after = await handle.stat();
  if (before.dev !== after.dev || before.ino !== after.ino) {
    await handle.close();
    throw new Error('HN archive directory rebound');
  }
  return handle;
}
async function file(parent: FileHandle, name: string, uid: number, limit: number): Promise<Buffer> {
  need(/^[a-zA-Z0-9._-]+$/u.test(name), 'HN archive fixed leaf required');
  const handle = await open(`/proc/self/fd/${parent.fd}/${name}`, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    need(before.isFile() && before.uid === uid && before.nlink === 1 &&
      (before.mode & 0o7777) === 0o600 && before.size > 0 && before.size <= limit,
      'HN archive private input file required');
    const bytes = await handle.readFile(), after = await handle.stat();
    need(bytes.length === before.size && before.dev === after.dev && before.ino === after.ino &&
      before.size === after.size && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs,
      'HN archive input changed');
    return bytes;
  } finally { await handle.close(); }
}
function packetPlan(packetBytes: Buffer, planBytes: Buffer, packetSha256: string): HnArchiveMissingPlan {
  need(archiveHash(packetBytes) === packetSha256, 'HN packet pin mismatch');
  const packet = JSON.parse(packetBytes.toString('utf8')) as Record<string, unknown>;
  need(Object.keys(packet).sort().join(',') === ['schemaVersion','kind','day','providerKey','manifestSha256',
    'itemsSha256','scope','bindingConfig','bindingConfigSha256','selectedIds','items'].sort().join(','),
    'HN packet shape mismatch');
  const scope = packet.scope as HnArchiveMissingPlan['scope'];
  const selectedIds = packet.selectedIds as string[];
  const unsigned = {
    schemaVersion: 1 as const, kind: 'hn-archive-missing.v1' as const,
    day: String(packet.day), providerKey: 'hacker-news' as const,
    coverage: 'PARTIAL_ARCHIVED_OBSERVATIONS' as const,
    semanticKey: createHash('sha256').update(canonicalJson({
      kind: 'hn-archive-missing.v1', day: packet.day,
      itemsSha256: packet.itemsSha256, selectedIds,
    })).digest('hex'),
    packetSha256, manifestSha256: String(packet.manifestSha256),
    itemsSha256: String(packet.itemsSha256), scope,
    bindingConfig: String(packet.bindingConfig), bindingConfigSha256: String(packet.bindingConfigSha256),
    selectedIds, candidateIds: selectedIds,
  };
  const plan = { ...unsigned, planSha256: archiveHash(JSON.stringify(unsigned)) };
  need(canonicalJson(plan) === canonicalJson(JSON.parse(planBytes.toString('utf8'))),
    'HN plan bytes do not match packet');
  validateHnArchivePlanShape(plan, plan.planSha256);
  need(Object.values(scope).every(value => typeof value === 'string' && uuid.test(value)), 'HN scope invalid');
  return plan;
}
export async function readHnArchiveMissingPartition(
  request: Pick<HnArchiveMissingRequest, 'inputRoot' | 'day' | 'semanticKey' | 'packetSha256'>,
  uid = 0,
): Promise<{ plan: HnArchiveMissingPlan; items: unknown; journalFilename: string }> {
  const input = await directory(absolute(request.inputRoot), uid);
  try {
    const packetBytes = await file(input, 'packet.json', uid, 64 * 1024 * 1024);
    const planBytes = await file(input, 'plan.json', uid, 128 * 1024);
    const plan = packetPlan(packetBytes, planBytes, request.packetSha256);
    need(plan.day === request.day && plan.semanticKey === request.semanticKey &&
      plan.selectedIds.length <= 100, 'HN recomputed identity/day mismatch');
    const items = (JSON.parse(packetBytes.toString('utf8')) as { items: unknown }).items;
    return { plan, items, journalFilename: `hn-archive-qualified-${plan.semanticKey}.journal.json` };
  } finally { await input.close(); }
}
function createDependencies(connection: PrismaIngestionWorkerConnection, plan: HnArchiveMissingPlan): HnArchiveMissingDependencies {
  const ids = new CryptoIdGenerator(), clock = new SystemClock();
  let projectedItems: readonly { sourceItemId: string; sourceExternalId: string; feedItemId: string }[] = [];
  return {
    existingIds: async selected => {
      const rows = await (connection as unknown as Transaction).$queryRawUnsafe<readonly { providerItemId: string }[]>(`
        SELECT provider_item_id AS "providerItemId" FROM source_items
        WHERE tenant_id=$1::uuid AND workspace_id=$2::uuid AND provider_key='hacker-news'
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
        ...scope, providerKey: 'hacker-news', items: input,
      });
      need(saved.inserted === input.length && saved.contentUpdated === 0 && saved.skippedDuplicates === 0,
        'HN insert-only persistence uncertain');
      const relation = await (connection as unknown as Transaction).$queryRawUnsafe<readonly { interestQuery: string }[]>(`
        SELECT i.query AS "interestQuery" FROM tenants t JOIN workspaces w ON w.tenant_id=t.id
        JOIN interests i ON i.tenant_id=t.id AND i.workspace_id=w.id
        JOIN source_bindings b ON b.tenant_id=t.id AND b.workspace_id=w.id AND b.interest_id=i.id
        JOIN source_catalog_entries c ON c.id=b.source_catalog_entry_id
        JOIN scan_policies p ON p.tenant_id=t.id AND p.workspace_id=w.id AND p.source_binding_id=b.id
        WHERE t.id=$1::uuid AND w.id=$2::uuid AND i.id=$3::uuid AND b.id=$4::uuid AND p.id=$5::uuid
          AND c.provider_key='hacker-news' AND b.config=$6::jsonb`,
        plan.scope.tenantId, plan.scope.workspaceId, plan.scope.interestId,
        plan.scope.sourceBindingId, plan.scope.scanPolicyId, plan.bindingConfig);
      need(relation.length === 1, 'HN scoped binding changed');
      const projected = await new PrismaFeedProjectionAdapter(connection, ids).project({
        ...scope, providerKey: 'hacker-news', sourceItems: saved.items.map(item => item.persistedItem),
        snapshots: {
          interestQuerySnapshot: { interestId: scope.interestId, query: relation[0]!.interestQuery },
          sourceBindingSnapshot: {
            sourceBindingId: scope.sourceBindingId, providerKey: 'hacker-news',
            sourceQuery: { mode: 'listing', query: `hn-archive-missing.v1:${plan.semanticKey}` },
          },
          workspaceScopeSnapshot: { tenantId: scope.tenantId, workspaceId: scope.workspaceId },
        },
      });
      need(projected.projected === input.length, 'HN feed projection uncertain');
      projectedItems = projected.projectedItems;
      return saved.inserted;
    },
    projectComments: async units => {
      const scope = { ...plan.scope, tenantId: tenantId(plan.scope.tenantId), workspaceId: workspaceId(plan.scope.workspaceId) };
      const result = await new ConversationUnitProjectionAdapter(
        new PrismaConversationUnitRepository(connection, ids), ids,
      ).project({
        ...scope, providerKey: 'hacker-news', projectedFeedItems: projectedItems,
        conversationUnits: units, observedAt: clock.now(),
      });
      need(result.skippedOrphans === 0 && result.skippedInvalid === 0, 'HN conversation projection refused units');
      return result.projected;
    },
    present: async selected => {
      const rows = await (connection as unknown as Transaction).$queryRawUnsafe<readonly { present: number }[]>(`
        SELECT COUNT(DISTINCT provider_item_id)::int AS present FROM source_items
        WHERE tenant_id=$1::uuid AND workspace_id=$2::uuid AND provider_key='hacker-news'
          AND provider_item_id=ANY($3::text[])`, plan.scope.tenantId, plan.scope.workspaceId, selected);
      return rows[0]?.present ?? 0;
    },
  };
}
export type HnArchiveMissingRuntime = Readonly<{
  openSql: (url: string) => Pick<ReturnType<typeof openFiniteOperatorSqlPool>, 'connect' | 'end'>;
  openPrisma: (url: string) => Promise<PrismaIngestionWorkerConnection>;
  testOwnerUid?: number;
}>;
export async function runHnArchiveMissingWithRuntime(
  request: HnArchiveMissingRequest, databaseUrl: string, runtime: HnArchiveMissingRuntime,
): Promise<Readonly<Record<string, unknown>>> {
  need(/^[a-f0-9]{64}$/u.test(request.expectedPlanSha256) &&
    /^[a-zA-Z0-9._:-]{1,128}$/u.test(request.correlationId), 'HN exact plan/correlation required');
  const uid = runtime.testOwnerUid ?? 0;
  const selected = await readHnArchiveMissingPartition(request, uid);
  need(selected.plan.planSha256 === request.expectedPlanSha256, 'HN recomputed plan mismatch');
  const journalDirectory = await directory(absolute(request.journalDir), uid);
  let sql: Pick<ReturnType<typeof openFiniteOperatorSqlPool>, 'connect' | 'end'> | undefined;
  let prisma: PrismaIngestionWorkerConnection | undefined;
  try {
    const url = finiteRssDatabaseUrl(databaseUrl);
    sql = runtime.openSql(url);
    await scopedRead(sql, selected.plan);
    prisma = await runtime.openPrisma(url);
    const started = hnArchiveJournalReceipt({
      plan: selected.plan, coverage: selected.plan.coverage, status: 'started',
      inserted: 0, alreadyPresent: 0, postWritePresent: 0,
    });
    const journalName = selected.journalFilename;
    const existing = await journalDirectory.stat().then(async () => {
      try { return await readFile(`/proc/self/fd/${journalDirectory.fd}/${journalName}`, 'utf8'); }
      catch { return undefined; }
    });
    if (existing === undefined) {
      await writeExclusive(`/proc/self/fd/${journalDirectory.fd}/${journalName}`, started);
      await journalDirectory.sync();
    }
    const result = await runWithTenantDatabaseAccess(selected.plan.scope, () =>
      connectionTransaction(prisma!, selected.plan, itemsFor(selected)));
    const complete = hnArchiveJournalReceipt({
      plan: selected.plan, coverage: selected.plan.coverage, status: 'complete', ...result,
    });
    const temporary = `/proc/self/fd/${journalDirectory.fd}/${journalName}.${selected.plan.planSha256}.complete.tmp`;
    await writeExclusive(temporary, complete);
    await journalDirectory.sync();
    await rename(temporary, `/proc/self/fd/${journalDirectory.fd}/${journalName}`);
    await journalDirectory.sync();
    return complete;
  } finally {
    try { await prisma?.close(); }
    finally { try { await sql?.end(); } finally { await journalDirectory.close(); } }
  }
}
function itemsFor(selected: Awaited<ReturnType<typeof readHnArchiveMissingPartition>>): unknown {
  return {
    generatedAt: '', jobId: 'retained-packet', window: { from: selected.plan.day, to: selected.plan.day },
    count: selected.plan.selectedIds.length, fetchErrors: 0, items: selected.items, itemsSha256: selected.plan.itemsSha256,
  };
}
async function connectionTransaction(
  connection: PrismaIngestionWorkerConnection, plan: HnArchiveMissingPlan, manifest: unknown,
): Promise<{ inserted: number; alreadyPresent: number; postWritePresent: number }> {
  return connection.$transaction(async tx => {
    const raw = tx as unknown as Transaction;
    await assertFiniteGitHubArchiveRole((sql, values) => raw.$queryRawUnsafe(sql, ...values), plan.scope, 'write');
    const guarded = insertOnlyFeedTransaction(noRetryGitHubArchiveTransaction(raw));
    return executeHnArchiveMissingImport(plan, manifest, createDependencies(guarded as PrismaIngestionWorkerConnection, plan),
      plan.planSha256);
  }, { isolationLevel: 'Serializable', maxWait: 5000, timeout: 120000 });
}
async function scopedRead(sql: Pick<ReturnType<typeof openFiniteOperatorSqlPool>, 'connect'>, plan: HnArchiveMissingPlan): Promise<void> {
  const client = await sql.connect();
  try {
    await assertFiniteGitHubArchiveRole(async (text, values) => {
      const result = await client.query(text, [...values]);
      return roleRows(result.rows);
    }, plan.scope, 'read');
  } finally { client.release(); }
}
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  need(args.length === 9 && args[0] === '--native-write' && process.getuid?.() === 0,
    'HN native root invocation required');
  const [, inputRoot, day, journalDir, semanticKey, expectedPlanSha256, packetSha256, correlationId, claimSha256] = args;
  need(/^[a-f0-9]{64}$/u.test(claimSha256!), 'HN exact native claim digest required');
  const parent = await directory('/run/social-monitor', 0);
  let raw: Buffer;
  try { raw = await file(parent, 'hn-archive-import-claim.json', 0, 8192); }
  finally { await parent.close(); }
  need(archiveHash(raw) === claimSha256, 'HN native claim changed');
  const plan = (await readHnArchiveMissingPartition({
    inputRoot: inputRoot!, day: day!, semanticKey: semanticKey!, packetSha256: packetSha256!,
  })).plan;
  validateHnArchiveClaim(JSON.parse(raw.toString('utf8')), plan, {
    inputRoot: inputRoot!, day: day!, journalDir: journalDir!, semanticKey: semanticKey!,
    planSha256: expectedPlanSha256!, packetSha256: packetSha256!, correlationId: correlationId!,
  });
  const receipt = await runHnArchiveMissingWithRuntime({
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
    process.stderr.write('HN retained import refused; preserve journal and UNKNOWN; no retry\n');
    process.exitCode = 1;
  });
}
