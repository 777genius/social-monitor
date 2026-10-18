import assert from 'node:assert/strict';
import { SystemClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { telegramPublicChannel } from '../libs/ingestion/domain/value-objects/telegram-public-channel';
import { HttpTelegramPreviewClient } from '../libs/ingestion/adapters/source/telegram/http-telegram-preview-client';
import { TelegramSourceProvider } from '../libs/ingestion/adapters/source/telegram/telegram-source.provider';
import { readTelegramCursor } from '../libs/ingestion/adapters/source/telegram/telegram-preview-cursor';

// Read-only, anonymous, bounded diagnostic. It does not certify a deployment or print channel content.
const run = async (): Promise<void> => {
  const channel = telegramPublicChannel(process.argv.find((arg) => arg.startsWith('--channel='))?.slice(10) ?? 'telegram');
  assert(channel, 'Provide a public username with --channel=');
  const client = new HttpTelegramPreviewClient();
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
  console.log(JSON.stringify({ diagnostic: 'telegram_public_preview_live', channel,
    anonymousPreviewObserved: true, stablePostIds: true, historyPageObserved: true,
    cursorResumeObserved: true, incompleteCoverageObserved: true,
    latestPageCount: first.posts.length, olderPageCount: older.posts.length,
    deploymentCertification: 'not_claimed',
  }));
};
void run().catch((error) => { console.error(error instanceof Error ? error.message : 'Telegram diagnostic failed'); process.exitCode = 1; });
