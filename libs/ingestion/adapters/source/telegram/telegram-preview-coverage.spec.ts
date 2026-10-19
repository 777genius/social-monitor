import { parseTelegramPreview } from './telegram-preview-html';
import { TelegramSourceProvider } from './telegram-source.provider';
import { writeTelegramCursor } from './telegram-preview-cursor';
import { scanTelegram, telegramClock, telegramHtml, telegramMessageHtml } from './telegram-preview.spec-support';

const window = { startInclusive: '2026-10-18T10:00:00Z', endExclusive: '2026-10-18T11:00:00Z' };
const message = (id: number, text: string, date: string, extra = '') =>
  telegramMessageHtml(id, text, extra).replace('2026-10-18T10:00:00Z', date);
const fromHtml = (html: string) => new TelegramSourceProvider({
  readPage: async () => parseTelegramPreview(telegramHtml(html), 'example_channel'),
}, telegramClock);

describe('Telegram preview coverage and content boundaries', () => {
  it('collects the inclusive start/exclusive end without importing unrelated preview warnings', async () => {
    const provider = fromHtml([
      message(5, '', window.endExclusive),
      message(4, 'Inside the period', '2026-10-18T10:30:00Z'),
      message(3, 'Exactly at the start', window.startInclusive),
      message(2, '', '2026-10-18T09:59:59Z'),
    ].join(''));
    const result = await scanTelegram(provider, undefined, { targetPublishedWindow: window });
    expect(result.items.map((item) => item.externalId)).toEqual(['example_channel/3', 'example_channel/4']);
    expect(result.collection).toEqual({ complete: true, contentComplete: true, backfillPending: false });
    expect(result.warnings).not.toContain('telegram.preview_content_incomplete');
    expect(result.pagination?.pageCount).toBe(1);
  });

  it('ignores missing dates and content in posts at the saved watermark', async () => {
    const provider = fromHtml(message(5, 'New post', '2026-10-18T10:30:00Z') + message(4, '', 'invalid'));
    const checkpoint = writeTelegramCursor({ version: 1, channel: 'example_channel', scope: 'live', lastId: 4 });
    const result = await scanTelegram(provider, checkpoint);
    expect(result.items.map((item) => item.externalId)).toEqual(['example_channel/5']);
    expect(result.collection).toEqual({ complete: true, contentComplete: true, backfillPending: false });
    expect(result.warnings).not.toContain('telegram.collection_incomplete:invalid_post_timestamp');
  });

  it('keeps a real in-range timestamp failure visible instead of inventing a publication time', async () => {
    const provider = fromHtml(message(5, 'New post', '2026-10-18T10:30:00Z') +
      message(4, 'Unknown publication time', 'invalid') + message(3, 'Old post', '2026-10-18T09:00:00Z'));
    const result = await scanTelegram(provider, undefined, { targetPublishedWindow: window });
    expect(result.items.map((item) => item.externalId)).toEqual(['example_channel/5']);
    expect(result.collection?.complete).toBe(false);
    expect(result.warnings).toContain('telegram.collection_incomplete:invalid_post_timestamp');
  });

  it('retains media-only post identity and gives a healthy empty repeat without old content warnings', async () => {
    const provider = fromHtml(message(5, '', '2026-10-18T10:30:00Z', '<div class="message_media_not_supported"></div>') +
      message(4, 'Outside initial lookback', '2026-10-16T09:00:00Z'));
    const first = await scanTelegram(provider);
    expect(first.items[0]).toMatchObject({ externalId: 'example_channel/5', title: 'Telegram post 5', body: '',
      metadata: { nativeContentIncomplete: true, telegramCollection: { status: 'complete', contentComplete: false } } });
    expect(first.collection).toEqual({ complete: true, contentComplete: false, backfillPending: false });
    const repeat = await scanTelegram(provider, first.nextCursor);
    expect(repeat.items).toEqual([]);
    expect(repeat.collection).toEqual({ complete: true, contentComplete: true, backfillPending: false });
    expect(repeat.nextCursor).toBe(first.nextCursor);
    expect(repeat.warnings).not.toContain('telegram.preview_content_incomplete');
  });
});
