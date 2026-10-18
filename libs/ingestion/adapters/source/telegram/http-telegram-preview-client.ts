import { telegramPublicChannel } from '../../../domain/value-objects/telegram-public-channel';
import { ContentHttpPolicyError, guardedContentGet, type ContentHttpRequest, type ContentHttpResponse } from '../../http/guarded-content-http';
import { parseTelegramPreview } from './telegram-preview-html';
import { TelegramPreviewError, type TelegramPreviewClientPort, type TelegramPreviewPage } from './telegram-preview-client.port';

export class HttpTelegramPreviewClient implements TelegramPreviewClientPort {
  constructor(
    private readonly timeoutMs = 10_000,
    private readonly get: (request: ContentHttpRequest) => Promise<ContentHttpResponse> = guardedContentGet,
  ) {}

  async readPage(channel: string, beforeId?: number): Promise<TelegramPreviewPage> {
    if (telegramPublicChannel(channel) !== channel ||
        (beforeId !== undefined && (!Number.isSafeInteger(beforeId) || beforeId <= 0))) {
      throw new TelegramPreviewError('Invalid public Telegram channel or message cursor', 'invalid_query', false);
    }
    const url = new URL(`https://t.me/s/${channel}`);
    if (beforeId !== undefined) url.searchParams.set('before', String(beforeId));
    let response: ContentHttpResponse;
    try {
      response = await this.get({ url: url.toString(), timeoutMs: this.timeoutMs, maxBytes: 2 * 1024 * 1024,
      maxRedirects: 0, headers: { accept: 'text/html', 'user-agent': 'SocialMonitor/0.1 public-channel-preview' } });
    } catch (error) {
      if (error instanceof ContentHttpPolicyError) {
        throw new TelegramPreviewError('Telegram preview violates the HTTP safety policy', 'unavailable', false);
      }
      throw error;
    }
    if (response.status === 429) {
      const raw = response.headers.get('retry-after');
      const seconds = raw === null ? NaN : Number(raw);
      throw new TelegramPreviewError('Telegram public preview rate limit', 'rate_limited', true,
        Number.isFinite(seconds) && seconds >= 0 ? Math.min(seconds * 1000, 86_400_000) : 60_000);
    }
    if (response.status !== 200 || response.finalUrl !== url.toString()) {
      throw new TelegramPreviewError(`Telegram public preview returned HTTP ${response.status}`, 'unavailable', response.status >= 500);
    }
    return parseTelegramPreview(response.body, channel);
  }
}
