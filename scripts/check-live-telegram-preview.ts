import assert from 'node:assert/strict';
import { SystemClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { telegramPublicChannel } from '../libs/ingestion/domain/value-objects/telegram-public-channel';
import { HttpTelegramPreviewClient } from '../libs/ingestion/adapters/source/telegram/http-telegram-preview-client';
import { TelegramSourceProvider } from '../libs/ingestion/adapters/source/telegram/telegram-source.provider';
import { readTelegramCursor } from '../libs/ingestion/adapters/source/telegram/telegram-preview-cursor';
import { guardedContentGet, type ContentHttpRequest } from '../libs/ingestion/adapters/http/guarded-content-http';
import type { TelegramPreviewPost } from '../libs/ingestion/adapters/source/telegram/telegram-preview-client.port';

const verifyPublishedWindow = async (channel: string, client: HttpTelegramPreviewClient, posts: readonly TelegramPreviewPost[]) => {
  const dates = [...new Set(posts.flatMap((post) => post.publishedAt === undefined ? [] : [post.publishedAt.getTime()]))]
    .sort((left, right) => right - left);
  assert(dates.length >= 4, 'Four publication boundaries are required for the live window probe');
  const start = dates[3]!, end = dates[0]!;
  const expected = new Set(posts.filter((post) => post.publishedAt !== undefined &&
    post.publishedAt.getTime() >= start && post.publishedAt.getTime() < end).map((post) => `${channel}/${post.id}`));
  assert(expected.size >= 3 && expected.size <= 8, 'Window probe must stay bounded while forcing resume');
  const provider = new TelegramSourceProvider(client, new SystemClock());
  const context = { tenantId: tenantId('telegram-window-diagnostic'), workspaceId: workspaceId('telegram-window-diagnostic'),
    sourceBindingId: 'telegram-window-diagnostic', scanJobId: 'telegram-window-diagnostic', correlationId: 'telegram-window-diagnostic',
    config: { maxItems: 2, maxPages: 1, targetPublishedWindow: {
      startInclusive: new Date(start).toISOString(), endExclusive: new Date(end).toISOString(),
    } },
  };
  const plan = provider.planScan({ mode: 'account_feed', query: channel }, context);
  const collected = new Set<string>();
  let cursor: string | undefined;
  let scans = 0;
  let completed = false;
  let contentComplete = true;
  for (; scans < 5; scans += 1) {
    const result = await provider.scan({ ...plan, cursor }, context);
    for (const item of result.items) {
      assert(expected.has(item.externalId) && !collected.has(item.externalId), 'Window leaked or repeated a post');
      collected.add(item.externalId);
    }
    contentComplete &&= result.collection?.contentComplete === true;
    cursor = result.nextCursor;
    if (result.collection?.complete) { completed = true; scans += 1; break; }
    assert(result.collection?.backfillPending, 'Incomplete traversal lost its resume position');
  }
  assert(completed && scans >= 2 && collected.size === expected.size, 'Window traversal missed a post or never resumed');
  const repeat = await provider.scan({ ...plan, cursor }, context);
  assert(repeat.items.length === 0 && repeat.collection?.complete === true && repeat.collection.contentComplete === true,
    'Completed window did not give a healthy empty repeat');
  return { windowedCoverageComplete: true, windowPostCount: collected.size, windowScans: scans,
    windowContentComplete: contentComplete, windowRepeatWithoutDuplicates: true };
};

// Simulate only the failed transport; successful mirror responses are live.
const liveMirrorProbe = (unavailableHosts: readonly string[]) => new HttpTelegramPreviewClient(10_000, async (request: ContentHttpRequest) => {
  if (unavailableHosts.includes(new URL(request.url).hostname)) {
    throw Object.assign(new Error('Injected Telegram domain transport failure'), { code: 'ECONNRESET' });
  }
  return guardedContentGet(request);
});

// Read-only, anonymous, bounded diagnostic. It does not certify a deployment or print channel content.
const run = async (): Promise<void> => {
  const channel = telegramPublicChannel(process.argv.find((arg) => arg.startsWith('--channel='))?.slice(10) ?? 'telegram');
  assert(channel, 'Provide a public username with --channel=');
  const verifyFallback = process.argv.includes('--verify-fallback');
  const client = verifyFallback ? liveMirrorProbe(['t.me']) : new HttpTelegramPreviewClient();
  const first = await client.readPage(channel);
  assert(first.posts.length > 0, 'Live preview has no posts to verify');
  const before = Math.min(...first.posts.map((post) => post.id));
  const older = await client.readPage(channel, before);
  assert(older.posts.length > 0 && older.posts.every((post) => post.id < before), 'History did not advance');
  const provider = new TelegramSourceProvider(client, new SystemClock());
  const context = { tenantId: tenantId('telegram-live-diagnostic'), workspaceId: workspaceId('telegram-live-diagnostic'),
    sourceBindingId: 'telegram-live-diagnostic', scanJobId: 'telegram-live-diagnostic', correlationId: 'telegram-live-diagnostic',
    config: { maxItems: 2, maxPages: 1, maxItemAgeHours: 8760 },
  };
  const plan = provider.planScan({ mode: 'account_feed', query: channel }, context);
  const result = await provider.scan(plan, context);
  assert(result.collection?.complete === false && result.collection.backfillPending, 'Bounded live collection must declare pending coverage');
  const cursor = readTelegramCursor(result.nextCursor, channel, 'live');
  assert(cursor.pending && cursor.lastId === 0, 'Partial collection must preserve its backfill state');
  const resumed = await provider.scan({ ...plan, cursor: result.nextCursor }, context);
  const next = readTelegramCursor(resumed.nextCursor, channel, 'live');
  assert(next.pending === undefined || next.pending.beforeId < cursor.pending.beforeId, 'Resume did not advance');
  assert(resumed.items.every((item) => !result.items.some((prior) => prior.externalId === item.externalId)), 'Resume repeated processed posts');
  const window = await verifyPublishedWindow(channel, client, [...first.posts, ...older.posts]);
  if (verifyFallback) {
    assert(first.warnings.includes('telegram.preview_endpoint_fallback:telegram.me'), 'First official mirror was not used');
    const lastMirror = await liveMirrorProbe(['t.me', 'telegram.me']).readPage(channel, before);
    assert(lastMirror.posts.length > 0 && lastMirror.posts.every((post) => post.id < before), 'Last official mirror lost the history boundary');
    assert(lastMirror.warnings.includes('telegram.preview_endpoint_fallback:telegram.dog'), 'Last official mirror was not used');
  }
  console.log(JSON.stringify({ diagnostic: 'telegram_public_preview_live', channel,
    anonymousPreviewObserved: true, stablePostIds: true, historyPageObserved: true,
    cursorResumeObserved: true, incompleteCoverageObserved: true,
    ...window,
    latestPageCount: first.posts.length, olderPageCount: older.posts.length,
    ...(verifyFallback ? { fallbackVerification: 'injected_transport_failure_with_live_mirrors', verifiedMirrors: ['telegram.me', 'telegram.dog'] } : {}),
    deploymentCertification: 'not_claimed',
  }));
};
void run().catch((error) => { console.error(error instanceof Error ? error.message : 'Telegram diagnostic failed'); process.exitCode = 1; });
