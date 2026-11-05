import { telegramPublicChannel } from '../../../domain/value-objects/telegram-public-channel';
import type { SourceQuery, SourceRuntimeConfig } from '../../../ports';
import { TelegramPreviewError } from './telegram-preview-client.port';

export const validateTelegramQuery = (query: SourceQuery): string => {
  if (!['account_feed', 'url'].includes(query.mode)) throw invalid('Telegram preview requires account_feed or url mode');
  const channel = telegramPublicChannel(query.query);
  if (channel === undefined) throw invalid('Telegram preview requires a public channel username or HTTPS t.me channel URL');
  return channel;
};

export const telegramPreviewConfig = (query: SourceQuery, config?: SourceRuntimeConfig) => {
  const channel = validateTelegramQuery(query);
  for (const key of ['channel', 'query', 'url']) {
    if (config?.[key] !== undefined && (typeof config[key] !== 'string' || telegramPublicChannel(config[key] as string) !== channel)) {
      throw invalid('Telegram channel configuration does not match the query');
    }
  }
  // Reject accidental legacy Bot/MTProto setup instead of silently ignoring it.
  for (const key of ['botToken', 'token', 'apiId', 'apiHash', 'session', 'credentialId', 'sourceCredentialId']) {
    if (config?.[key] !== undefined) throw invalid('Telegram public preview does not accept credentials');
  }
  const maxItems = bounded(config?.maxItems, 50, 1, 500, 'maxItems');
  const maxPages = bounded(config?.maxPages, 5, 1, 20, 'maxPages');
  const ageHours = bounded(config?.maxItemAgeHours, 24, 1, 24 * 365, 'maxItemAgeHours');
  let window: { start: number; end: number } | undefined;
  if (config?.targetPublishedWindow !== undefined) {
    const value = config.targetPublishedWindow;
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw invalid('Invalid Telegram target published window');
    const raw = value as Readonly<Record<string, unknown>>;
    const start = typeof raw.startInclusive === 'string' ? Date.parse(raw.startInclusive) : NaN;
    const end = typeof raw.endExclusive === 'string' ? Date.parse(raw.endExclusive) : NaN;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= end) throw invalid('Invalid Telegram target published window');
    window = { start, end };
  }
  return { channel, maxItems, maxPages, ageHours, window, scope: window === undefined ? 'live' : `${window.start}/${window.end}` };
};

const bounded = (value: unknown, fallback: number, min: number, max: number, label: string): number => {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw invalid(`Telegram ${label} must be an integer between ${min} and ${max}`);
  return value;
};
const invalid = (message: string) => new TelegramPreviewError(message, 'invalid_query', false);
