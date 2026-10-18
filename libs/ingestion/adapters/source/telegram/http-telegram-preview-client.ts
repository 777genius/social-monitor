import { telegramPublicChannel } from '../../../domain/value-objects/telegram-public-channel';
import { ContentHttpPolicyError, guardedContentGet, type ContentHttpRequest, type ContentHttpResponse } from '../../http/guarded-content-http';
import { parseTelegramPreview } from './telegram-preview-html';
import { TelegramPreviewError, type TelegramPreviewClientPort, type TelegramPreviewPage } from './telegram-preview-client.port';

const previewHosts = ['t.me', 'telegram.me', 'telegram.dog'] as const;
const retryableNetworkCodes = new Set([
  'ECONNABORTED', 'ECONNREFUSED', 'ECONNRESET', 'EHOSTDOWN', 'EHOSTUNREACH',
  'ENETDOWN', 'ENETUNREACH', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE', 'ETIMEDOUT',
  'ERR_STREAM_PREMATURE_CLOSE',
]);

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
    const deadline = AbortSignal.timeout(this.timeoutMs);
    const attemptTimeoutMs = Math.max(1, Math.floor(this.timeoutMs / previewHosts.length));
    for (const host of previewHosts) {
      if (deadline.aborted) break;
      const url = new URL(`https://${host}/s/${channel}`);
      if (beforeId !== undefined) url.searchParams.set('before', String(beforeId));
      const signal = AbortSignal.any([deadline, AbortSignal.timeout(attemptTimeoutMs)]);
      let response: ContentHttpResponse;
      try {
        response = await this.get({ url: url.toString(), timeoutMs: attemptTimeoutMs, signal,
          maxBytes: 2 * 1024 * 1024, maxRedirects: 0, readBodyForStatuses: [200],
          headers: { accept: 'text/html', 'user-agent': 'SocialMonitor/0.1 public-channel-preview' } });
      } catch (error) {
        if (hasPolicyError(error)) {
          throw new TelegramPreviewError('Telegram preview violates the HTTP safety policy', 'unavailable', false);
        }
        if (!isRetryableTransportError(error)) throw error;
        continue;
      }
      if (response.finalUrl !== url.toString()) {
        throw new TelegramPreviewError('Telegram public preview returned an unexpected URL', 'unavailable', false);
      }
      if (response.status === 429) {
        const raw = response.headers.get('retry-after');
        const seconds = raw === null ? NaN : Number(raw);
        throw new TelegramPreviewError('Telegram public preview rate limit', 'rate_limited', true,
          Number.isFinite(seconds) && seconds >= 0 ? Math.min(seconds * 1000, 86_400_000) : 60_000);
      }
      if (response.status >= 500 && response.status <= 599) continue;
      if (response.status !== 200) {
        throw new TelegramPreviewError(`Telegram public preview returned HTTP ${response.status}`, 'unavailable', false);
      }
      if (signal.aborted) continue;
      const page = parseTelegramPreview(response.body, channel);
      return host === 't.me' ? page : {
        ...page, warnings: [...page.warnings, `telegram.preview_endpoint_fallback:${host}`],
      };
    }
    throw new TelegramPreviewError('Telegram public preview endpoints are unavailable', 'unavailable', true);
  }
}

const isRetryableTransportError = (error: unknown): boolean => error !== null && typeof error === 'object' &&
  (('name' in error && (error.name === 'AbortError' || error.name === 'TimeoutError')) ||
    ('code' in error && typeof error.code === 'string' && retryableNetworkCodes.has(error.code)));

const hasPolicyError = (error: unknown): boolean => {
  const seen = new Set<unknown>();
  let current = error;
  while (current !== null && typeof current === 'object' && !seen.has(current)) {
    if (current instanceof ContentHttpPolicyError) return true;
    seen.add(current);
    current = 'cause' in current ? current.cause : undefined;
  }
  return false;
};
