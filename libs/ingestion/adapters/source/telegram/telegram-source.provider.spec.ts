import { TelegramPreviewError } from './telegram-preview-client.port';
import { readTelegramCursor, writeTelegramCursor } from './telegram-preview-cursor';
import { TelegramSourceProvider } from './telegram-source.provider';
import { certifySourceProvider } from '../testing/source-provider-certification';
import { FixtureTelegramPreviewClient } from './fixture-telegram-preview-client';
import { scanTelegram, telegramClient, telegramClock, telegramContext, telegramPost } from './telegram-preview.spec-support';

describe('Telegram preview incremental collection', () => {
  certifySourceProvider({
    providerFactory: () => new TelegramSourceProvider(new FixtureTelegramPreviewClient(telegramClock), telegramClock),
    validQuery: { mode: 'account_feed', query: '@example_channel' }, unsupportedQueryMode: 'search',
    expectedProviderKey: 'telegram', expectedFailureKind: 'unavailable',
  });
  it('resumes item-limited backfill before committing the high watermark and captures later arrivals', async () => {
    const posts = [1, 2, 4, 7, 8, 11].map((id) => telegramPost(id));
    const provider = new TelegramSourceProvider(telegramClient(posts), telegramClock);
    const first = await scanTelegram(provider, undefined, { maxItems: 2 });
    expect(first.items.map((item) => item.externalId)).toEqual(['example_channel/11', 'example_channel/8']);
    const firstCursor = readTelegramCursor(first.nextCursor, 'example_channel', 'live');
    expect(firstCursor.lastId).toBe(0);
    expect(firstCursor.pending?.beforeId).toBe(8);
    expect(first.warnings).toContain('telegram.collection_incomplete:max_items');
    posts.push(telegramPost(15));
    const collected = new Set(first.items.map((item) => item.externalId));
    let cursor = first.nextCursor;
    for (let i = 0; i < 4; i += 1) {
      const result = await scanTelegram(provider, cursor, { maxItems: 2 });
      cursor = result.nextCursor;
      result.items.forEach((item) => collected.add(item.externalId));
    }
    expect([...collected].sort()).toEqual([1, 2, 4, 7, 8, 11, 15].map((id) => `example_channel/${id}`).sort());
    expect(readTelegramCursor(cursor, 'example_channel', 'live').lastId).toBe(15);
    expect((await scanTelegram(provider, cursor)).items).toEqual([]);
  });

  it('resumes page-limited collection and crosses sparse/deleted message IDs', async () => {
    const provider = new TelegramSourceProvider(telegramClient([25, 18, 12, 10, 3].map((id) => telegramPost(id)), 2), telegramClock);
    const prior = writeTelegramCursor({ version: 1, channel: 'example_channel', scope: 'live', lastId: 8 });
    const first = await scanTelegram(provider, prior, { maxPages: 1 });
    expect(first.warnings).toContain('telegram.collection_incomplete:max_pages');
    const second = await scanTelegram(provider, first.nextCursor);
    expect(second.items.map((item) => item.externalId)).toEqual(['example_channel/12', 'example_channel/10']);
    expect(second.warnings).toContain('telegram.collection_complete');
    expect(readTelegramCursor(second.nextCursor, 'example_channel', 'live').lastId).toBe(25);
  });

  it('never moves the completed ID backwards when recent posts were deleted', async () => {
    const provider = new TelegramSourceProvider(telegramClient([telegramPost(9), telegramPost(8)]), telegramClock);
    const prior = writeTelegramCursor({ version: 1, channel: 'example_channel', scope: 'live', lastId: 10 });
    const result = await scanTelegram(provider, prior);
    expect(result.items).toEqual([]);
    expect(readTelegramCursor(result.nextCursor, 'example_channel', 'live').lastId).toBe(10);
  });

  it('catches up posts older than the initial lookback after an outage', async () => {
    const provider = new TelegramSourceProvider(telegramClient([telegramPost(12), telegramPost(11), telegramPost(10)]),
      { now: () => new Date('2026-10-25T12:00:00Z') });
    const prior = writeTelegramCursor({ version: 1, channel: 'example_channel', scope: 'live', lastId: 10 });
    expect((await scanTelegram(provider, prior)).items.map((item) => item.externalId)).toEqual(['example_channel/12', 'example_channel/11']);
  });

  it('freezes the initial lookback while a multi-run backlog is being drained', async () => {
    let now = new Date('2026-10-18T12:00:00Z');
    const provider = new TelegramSourceProvider(telegramClient([6, 5, 4, 3, 2, 1].map((id) => telegramPost(id)), 2), { now: () => now });
    const first = await scanTelegram(provider, undefined, { maxPages: 1 });
    now = new Date('2026-10-21T12:00:00Z');
    const second = await scanTelegram(provider, first.nextCursor);
    expect(second.items).toHaveLength(4);
    expect(second.warnings).toContain('telegram.collection_complete');
  });

  it('keeps partial content visible and explicitly marks the result incomplete', async () => {
    const provider = new TelegramSourceProvider(telegramClient([telegramPost(2, { incomplete: true }), telegramPost(1, { text: '' })]), telegramClock);
    const result = await scanTelegram(provider);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.canonicalUrl).toBe('https://t.me/example_channel/2');
    expect(result.items[0]?.metadata?.nativeContentComplete).toBe(false);
    expect(result.items[0]?.metadata?.telegramCollection).toMatchObject({ status: 'partial' });
    expect(result.warnings).not.toContain('telegram.collection_complete');
  });

  it('keeps a resumable cursor after a later page is rate-limited and respects Retry-After', async () => {
    const readPage = jest.fn().mockResolvedValueOnce({ posts: [telegramPost(8), telegramPost(7)], warnings: [] })
      .mockRejectedValueOnce(new TelegramPreviewError('limited', 'rate_limited', true, 300_000));
    const provider = new TelegramSourceProvider({ readPage }, telegramClock);
    const result = await scanTelegram(provider);
    expect(result.items).toHaveLength(2);
    expect(readTelegramCursor(result.nextCursor, 'example_channel', 'live').pending?.beforeId).toBe(7);
    await expect(scanTelegram(provider, result.nextCursor)).rejects.toMatchObject({ kind: 'rate_limited', retryAfterMs: 300_000 });
    expect(readPage).toHaveBeenCalledTimes(2);
  });

  it('fails an inaccessible first page without reporting healthy empty collection', async () => {
    const provider = new TelegramSourceProvider({ readPage: async () => { throw new TelegramPreviewError('unavailable', 'unavailable', false); } }, telegramClock);
    await expect(scanTelegram(provider)).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('marks non-progressing pagination incomplete without skipping its pending range', async () => {
    const provider = new TelegramSourceProvider({ readPage: async () => ({ posts: [telegramPost(9), telegramPost(8)], warnings: [] }) }, telegramClock);
    const result = await scanTelegram(provider);
    expect(result.items).toHaveLength(2);
    expect(result.warnings).toContain('telegram.collection_incomplete:pagination_not_advanced');
    expect(readTelegramCursor(result.nextCursor, 'example_channel', 'live').pending?.beforeId).toBe(8);
  });

  it('persists an inaccessible history gap while continuing to collect new posts', async () => {
    const posts = [telegramPost(9), telegramPost(8)];
    const provider = new TelegramSourceProvider(telegramClient(posts), telegramClock);
    const checkpoint = writeTelegramCursor({ version: 1, channel: 'example_channel', scope: 'live', lastId: 2 });
    const result = await scanTelegram(provider, checkpoint);
    const cursor = readTelegramCursor(result.nextCursor, 'example_channel', 'live');
    expect(cursor).toMatchObject({ lastId: 9, historyGap: { afterId: 2, beforeId: 8 } });
    expect(cursor.pending).toBeUndefined();
    expect(result.collection).toEqual({ complete: false, backfillPending: false });
    posts.push(telegramPost(10));
    const next = await scanTelegram(provider, result.nextCursor);
    expect(next.items.map((item) => item.externalId)).toEqual(['example_channel/10']);
    expect(next.warnings).toContain('telegram.collection_incomplete:history_gap');
  });

  it.each([false, true])('retains a terminal history gap and resumes the head (pending first=%s)', async (pendingFirst) => {
    let newest = 9;
    const provider = new TelegramSourceProvider({ readPage: async (_channel, before) => {
      if (before !== undefined) throw new TelegramPreviewError('Old preview unavailable', 'unavailable', false);
      return { posts: [telegramPost(newest), telegramPost(8)], warnings: [] };
    } }, telegramClock);
    const prior = writeTelegramCursor({ version: 1, channel: 'example_channel', scope: 'live', lastId: 2,
      ...(pendingFirst ? { pending: { beforeId: 8, ceilingId: 9, floorId: 2, fromTime: 0, untilTime: Number.MAX_SAFE_INTEGER } } : {}),
    });
    const partial = await scanTelegram(provider, prior);
    expect(readTelegramCursor(partial.nextCursor, 'example_channel', 'live')).toMatchObject({ lastId: 9, historyGap: { afterId: 2, beforeId: 8 } });
    expect(partial.collection).toEqual({ complete: false, backfillPending: false });
    newest = 10;
    expect((await scanTelegram(provider, partial.nextCursor)).items.map((item) => item.externalId)).toEqual(['example_channel/10']);
  });

  it('binds cursor identity, rejects malformed state and separates historical/live scopes', async () => {
    const provider = new TelegramSourceProvider(telegramClient([telegramPost(10)]), telegramClock);
    await expect(scanTelegram(provider, 'bad')).rejects.toMatchObject({ kind: 'invalid_query' });
    const foreign = writeTelegramCursor({ version: 1, channel: 'another_channel', scope: 'live', lastId: 10 });
    await expect(scanTelegram(provider, foreign)).rejects.toMatchObject({ kind: 'invalid_query' });
    const historical = writeTelegramCursor({ version: 1, channel: 'example_channel', scope: '1/2', lastId: 100 });
    expect((await scanTelegram(provider, historical)).items).toHaveLength(1);
  });

  it('validates configuration and rejects private channels and credentials', () => {
    const provider = new TelegramSourceProvider(telegramClient([]), telegramClock);
    for (const query of ['https://t.me/+private', 'https://t.me/c/123/456', 'https://other.example/channel', 'https://t.me/example_channel?login=1']) {
      expect(provider.validateBinding({ mode: 'url', query }).ok).toBe(false);
    }
    expect(() => provider.planScan({ mode: 'account_feed', query: '@example_channel' }, telegramContext({ maxPages: 0 }))).toThrow('maxPages');
    expect(() => provider.planScan({ mode: 'account_feed', query: '@example_channel' }, telegramContext({ botToken: 'fake' }))).toThrow('credentials');
  });
});
