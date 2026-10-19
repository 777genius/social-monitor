import { randomBytes } from 'node:crypto';
import {
  acquirePrismaPgRuntimeConnection, defaultPostgresRuntimePoolConfig, runWithSystemDatabaseAccess,
  type PrismaPgRuntimeClientConstructor,
} from '@social-monitor/platform-persistence';
import { loadPrismaRuntimeClient } from '@social-monitor/platform-persistence/prisma-runtime-client';
import type { PrismaClient } from '../prisma/generated/client/client';
import { runTelegramChannelCollection } from './run-telegram-channel-collection';
import { telegramCollectionChannel, telegramCollectionConfig, telegramCollectionPolicy, telegramCollectionScope } from './lib/telegram-channel-collection-contract';

class TelegramSandboxCheckError extends Error {
  constructor(readonly code: string) { super(code); }
}
function check(condition: unknown, code: string): asserts condition {
  if (!condition) throw new TelegramSandboxCheckError(code);
}
const same = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);

/** No production URL, DNS alias, query override, or arbitrary database is accepted. */
export const requiredTelegramCollectionTestDatabaseUrl = (env: NodeJS.ProcessEnv): string => {
  const raw = env.TELEGRAM_COLLECTION_TEST_DATABASE_URL;
  check(typeof raw === 'string' && raw.length > 0, 'test_database_required');
  let url: URL;
  try { url = new URL(raw); } catch { throw new TelegramSandboxCheckError('unsafe_test_database'); }
  check(['postgres:', 'postgresql:'].includes(url.protocol) && ['127.0.0.1', '[::1]'].includes(url.hostname) &&
    /^\/telegram_collection_test_[a-z0-9_]+$/.test(url.pathname) && url.search === '' && url.hash === '', 'unsafe_test_database');
  return raw;
};

const withFixtureDatabase = async <T>(databaseUrl: string, operation: (client: PrismaClient) => Promise<T>): Promise<T> => {
  const PrismaClient = loadPrismaRuntimeClient<PrismaPgRuntimeClientConstructor<PrismaClient>>();
  const connection = await acquirePrismaPgRuntimeConnection(defaultPostgresRuntimePoolConfig(databaseUrl, 'admin-tool'), PrismaClient);
  try {
    return await runWithSystemDatabaseAccess('isolated Telegram PG18 collection fixture', () => operation(connection.client));
  } finally { await connection.close(); }
};

const seedEmptyFixture = async (client: PrismaClient, databaseName: string): Promise<void> => {
  const [server] = await client.$queryRaw<readonly { version: string; database: string }[]>`
    SELECT current_setting('server_version_num') AS version, current_database() AS database`;
  check(server !== undefined && Number(server.version) >= 180000 && Number(server.version) < 190000 &&
    server.database === databaseName, 'postgres18_sandbox_required');
  const counts = await Promise.all([
    client.tenant.count(), client.workspace.count(), client.interest.count(), client.sourceCatalogEntry.count(),
    client.capabilityProfile.count(), client.sourceBinding.count(), client.scanPolicy.count(), client.cursorCheckpoint.count(),
    client.sourceItem.count(), client.feedItem.count(), client.sourceCandidateMemory.count(), client.scanJob.count(),
    client.scanAttempt.count(), client.scanLeaseEntry.count(), client.scanFailureQueueEntry.count(), client.outboxEvent.count(),
    client.idempotencyKey.count(), client.conversationUnit.count(), client.sourceItemEngagementSnapshot.count(),
    client.sourceItemEngagementObservation.count(), client.sourceItemEngagementDailyRollup.count(), client.feedSignalBaselineSample.count(),
  ]);
  check(counts.every((count) => count === 0), 'fresh_empty_fixture_required');
  await client.$transaction(async (transaction) => {
    await transaction.tenant.create({ data: { id: telegramCollectionScope.tenantId, slug: 'telegram-collection-test', name: 'Telegram test fixture' } });
    await transaction.workspace.create({ data: { id: telegramCollectionScope.workspaceId, tenantId: telegramCollectionScope.tenantId,
      slug: 'telegram-collection-test', name: 'Telegram test workspace' } });
    await transaction.interest.create({ data: { id: telegramCollectionScope.interestId, tenantId: telegramCollectionScope.tenantId,
      workspaceId: telegramCollectionScope.workspaceId, name: 'Telegram sandbox interest', query: 'AI engineering' } });
  }, { isolationLevel: 'Serializable' });
};

const inventory = async (client: PrismaClient) => {
  const [sources, feed, jobs, attempts, checkpoints] = await Promise.all([
    client.sourceItem.findMany({ select: { id: true, tenantId: true, workspaceId: true, sourceBindingId: true,
      providerKey: true, providerItemId: true, canonicalUrl: true, metadata: true } }),
    client.feedItem.findMany({ select: { id: true, tenantId: true, workspaceId: true, interestId: true,
      sourceBindingId: true, providerKey: true, sourceItemId: true, canonicalUrl: true } }),
    client.scanJob.findMany({ select: { id: true, tenantId: true, workspaceId: true, sourceBindingId: true,
      scanPolicyId: true, status: true, executionMetadata: true } }),
    client.scanAttempt.findMany({ select: { scanJobId: true, tenantId: true, workspaceId: true,
      sourceBindingId: true, status: true, fetched: true, inserted: true, projected: true } }),
    client.cursorCheckpoint.findMany({ select: { tenantId: true, workspaceId: true, sourceBindingId: true, cursorPayload: true } }),
  ]);
  return { sources, feed, jobs, attempts, checkpoints };
};
type Inventory = Awaited<ReturnType<typeof inventory>>;
type RunnerResult = Awaited<ReturnType<typeof runTelegramChannelCollection>>;
type CollectedResult = Extract<RunnerResult, { scanJobId: string }>;

const assertBootstrap = async (client: PrismaClient, result: RunnerResult): Promise<void> => {
  check(result.sourceBindingId !== undefined && result.scanPolicyId !== undefined, 'bootstrap_ids_missing');
  const [bindings, policies, catalogs, profiles, events, idempotency] = await Promise.all([
    client.sourceBinding.findMany(), client.scanPolicy.findMany(), client.sourceCatalogEntry.findMany(),
    client.capabilityProfile.findMany(), client.outboxEvent.count(), client.idempotencyKey.count(),
  ]);
  check(bindings.length === 1 && policies.length === 1 && catalogs.length === 1 && profiles.length === 1 &&
    events === 2 && idempotency === 2, 'bootstrap_not_idempotent');
  const binding = bindings[0]!, policy = policies[0]!;
  check(binding.id === result.sourceBindingId && binding.tenantId === telegramCollectionScope.tenantId &&
    binding.workspaceId === telegramCollectionScope.workspaceId && binding.interestId === telegramCollectionScope.interestId &&
    binding.status === 'ENABLED' && binding.sourceCatalogEntryId === catalogs[0]!.id &&
    catalogs[0]!.providerKey === 'telegram' && profiles[0]!.sourceId === catalogs[0]!.id, 'bootstrap_scope_changed');
  const config = binding.config;
  check(config !== null && typeof config === 'object' && !Array.isArray(config) &&
    Object.keys(config).length === Object.keys(telegramCollectionConfig).length &&
    Object.entries(telegramCollectionConfig).every(([key, value]) => config[key] === value), 'bootstrap_config_changed');
  check(policy.id === result.scanPolicyId && policy.sourceBindingId === binding.id &&
    policy.tenantId === binding.tenantId && policy.workspaceId === binding.workspaceId &&
    policy.intervalSeconds === telegramCollectionPolicy.intervalSeconds && policy.freshnessSeconds === telegramCollectionPolicy.freshnessSeconds &&
    policy.retryBudget === 0, 'bootstrap_policy_changed');
};

const assertCollected = (current: Inventory, previous: Inventory, result: CollectedResult, expectedScans: number): void => {
  check(Number.isInteger(result.pageCount) && result.pageCount >= 1 && result.pageCount <= 5 &&
    Number.isInteger(result.fetched) && result.fetched >= 0 && result.fetched <= 50, 'live_page_or_item_budget_changed');
  const scoped = (value: { tenantId: string; workspaceId: string; sourceBindingId: string }) =>
    value.tenantId === telegramCollectionScope.tenantId && value.workspaceId === telegramCollectionScope.workspaceId &&
    value.sourceBindingId === result.sourceBindingId;
  check(current.sources.every((source) => scoped(source) && source.providerKey === 'telegram' &&
    /^hiaimediaen\/[1-9][0-9]*$/.test(source.providerItemId) && source.canonicalUrl === `https://t.me/${source.providerItemId}`), 'source_identity_or_scope_changed');
  check(new Set(current.sources.map((source) => source.providerItemId)).size === current.sources.length, 'duplicate_source_identity');
  const sourcesById = new Map(current.sources.map((source) => [source.id, source]));
  check(current.feed.every((item) => scoped(item) && item.interestId === telegramCollectionScope.interestId &&
    item.providerKey === 'telegram' && sourcesById.get(item.sourceItemId)?.canonicalUrl === item.canonicalUrl), 'feed_reference_or_scope_changed');
  check(new Set(current.feed.map((item) => item.sourceItemId)).size === current.feed.length, 'duplicate_feed_identity');
  check(current.feed.length === current.sources.length && current.sources.length - previous.sources.length === result.inserted &&
    current.feed.length - previous.feed.length === result.inserted, 'source_feed_count_delta_changed');
  const nativeIdentities = new Map(current.sources.map((source) => [source.providerItemId, source.id]));
  const feedIdentities = new Map(current.feed.map((item) => [item.sourceItemId, item.id]));
  check(previous.sources.every((source) => nativeIdentities.get(source.providerItemId) === source.id) &&
    previous.feed.every((item) => feedIdentities.get(item.sourceItemId) === item.id), 'persisted_identity_replaced');
  check(current.jobs.length === expectedScans && current.attempts.length === expectedScans &&
    current.jobs.every((job) => scoped(job) && job.scanPolicyId === result.scanPolicyId && job.status === 'SUCCEEDED') &&
    current.attempts.every((attempt) => scoped(attempt) && attempt.status === 'SUCCEEDED'), 'scan_history_missing');
  const job = current.jobs.find((entry) => entry.id === result.scanJobId);
  const attempt = current.attempts.find((entry) => entry.scanJobId === result.scanJobId);
  check(attempt !== undefined && attempt.fetched === result.fetched && attempt.inserted === result.inserted &&
    attempt.projected === result.projected, 'scan_attempt_counts_changed');
  const metadata = job?.executionMetadata;
  check(metadata !== null && typeof metadata === 'object' && !Array.isArray(metadata) &&
    metadata.providerKey === 'telegram' && metadata.collectionComplete === result.complete && typeof metadata.contentComplete === 'boolean' &&
    metadata.backfillPending === result.backfillPending && metadata.pageCount === result.pageCount &&
    result.status === (result.complete ? 'complete' : 'partial'), 'persisted_completeness_missing');
  check(current.checkpoints.length === 1 && scoped(current.checkpoints[0]!), 'durable_checkpoint_missing');
  const payload = current.checkpoints[0]!.cursorPayload;
  check(payload !== null && typeof payload === 'object' && !Array.isArray(payload) && typeof payload.cursor === 'string', 'checkpoint_payload_invalid');
  const raw = payload.cursor;
  check(raw.startsWith('telegram.preview.v1:'), 'native_checkpoint_format_changed');
  const cursor: unknown = JSON.parse(Buffer.from(raw.slice('telegram.preview.v1:'.length), 'base64url').toString('utf8'));
  check(cursor !== null && typeof cursor === 'object' && 'scope' in cursor && cursor.scope === 'live' &&
    'channel' in cursor && cursor.channel === telegramCollectionChannel && 'lastId' in cursor && Number.isSafeInteger(cursor.lastId), 'native_checkpoint_scope_changed');
  check(result.cursorAfter !== null && result.cursorAfter.lastId === cursor.lastId, 'reported_checkpoint_changed');
};

export const checkTelegramChannelCollectionPostgres = async (env: NodeJS.ProcessEnv) => {
  const databaseUrl = requiredTelegramCollectionTestDatabaseUrl(env);
  let phase = 'empty_fixture';
  try {
    await withFixtureDatabase(databaseUrl, (client) => seedEmptyFixture(client, new URL(databaseUrl).pathname.slice(1)));
    const runnerEnv: NodeJS.ProcessEnv = { DATABASE_URL: databaseUrl, SOCIAL_MONITOR_RUNTIME_PROFILE: 'beta',
      SOURCE_CONFIG_ENCRYPTION_KEY: randomBytes(32).toString('base64'), SOURCE_CONFIG_ENCRYPTION_KEY_ID: 'sandbox-ephemeral' };
    phase = 'inspect';
    const inspected = await runTelegramChannelCollection([], runnerEnv);
    check(inspected.status === 'not_bootstrapped' && !inspected.catalogReady && inspected.sourceBindingId === undefined, 'inspect_wrote_state');
    phase = 'bootstrap';
    const bootstrap = await runTelegramChannelCollection(['--bootstrap'], runnerEnv);
    const repeated = await runTelegramChannelCollection(['--bootstrap'], runnerEnv);
    check(bootstrap.status === 'ready' && repeated.status === 'ready' && same(bootstrap, repeated), 'bootstrap_ids_changed');
    let prior = await withFixtureDatabase(databaseUrl, async (client) => { await assertBootstrap(client, repeated); return inventory(client); });
    const results: CollectedResult[] = [];
    for (let scan = 1; scan <= 2; scan += 1) {
      phase = `live_collect_${scan}`;
      const result = await runTelegramChannelCollection(['--collect'], runnerEnv);
      check('scanJobId' in result, 'collection_result_missing');
      const current = await withFixtureDatabase(databaseUrl, inventory);
      assertCollected(current, prior, result, scan);
      check(current.sources.length > 0, 'live_post_required_for_end_to_end_proof');
      if (scan === 2) check(same(result.cursorBefore, results[0]!.cursorAfter), 'second_scan_did_not_reuse_cursor');
      results.push(result);
      prior = current;
    }
    check(results[0]!.scanJobId !== results[1]!.scanJobId, 'scan_attempt_identity_reused');
    return { ok: true, postgresMajor: 18, liveAnonymousHttps: true, nativeAuthorityQualified: false,
      qualification: 'isolated-canonical-schema-only', channel: telegramCollectionChannel,
      sourceBindingId: bootstrap.sourceBindingId, scanPolicyId: bootstrap.scanPolicyId,
      sourceCount: prior.sources.length, feedCount: prior.feed.length,
      scans: results.map((result) => ({ scanJobId: result.scanJobId, fetched: result.fetched, inserted: result.inserted,
        projected: result.projected, complete: result.complete, backfillPending: result.backfillPending,
        pageCount: result.pageCount, cursorBefore: result.cursorBefore, cursorAfter: result.cursorAfter })) };
  } catch (error) {
    if (error instanceof TelegramSandboxCheckError) throw error;
    throw new TelegramSandboxCheckError(`${phase}_failed`);
  }
};

if (require.main === module) void checkTelegramChannelCollectionPostgres(process.env).then((report) => {
  process.stdout.write(`${JSON.stringify(report)}\n`);
}).catch((error: unknown) => {
  process.stdout.write(`${JSON.stringify({ ok: false, nativeAuthorityQualified: false,
    code: error instanceof TelegramSandboxCheckError ? error.code : 'sandbox_check_failed' })}\n`);
  process.exitCode = 1;
});
