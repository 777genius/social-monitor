import { telegramPublicChannel } from '@social-monitor/ingestion/domain/value-objects/telegram-public-channel';
import type { SourceBindingConfig, SourceBindingConfigValidationResult } from '../../ports';

export const validateTelegramSourceBindingConfig = (config: SourceBindingConfig): SourceBindingConfigValidationResult => {
  const mode = firstNonEmptyString(config.mode) ?? 'account_feed';
  const channel = firstNonEmptyString(config.channel, config.query, config.url);
  if (!['account_feed', 'url'].includes(mode) || channel === undefined || telegramPublicChannel(channel) === undefined) {
    return { ok: false, reason: 'Telegram requires a public channel username or HTTPS t.me channel URL.' };
  }
  for (const key of ['channel', 'query', 'url']) {
    if (config[key] !== undefined && (typeof config[key] !== 'string' ||
        telegramPublicChannel(config[key] as string) !== telegramPublicChannel(channel))) {
      return { ok: false, reason: 'Telegram channel inputs must identify the same public channel.' };
    }
  }
  for (const key of ['botToken', 'token', 'apiId', 'apiHash', 'session', 'credentialId', 'sourceCredentialId']) {
    if (config[key] !== undefined) return { ok: false, reason: 'Telegram public preview does not accept credentials.' };
  }
  for (const [field, max] of [['maxItems', 500], ['maxPages', 20], ['maxItemAgeHours', 24 * 365]] as const) {
    const value = config[field];
    if (value !== undefined && (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > max)) {
      return { ok: false, reason: `Telegram ${field} must be an integer between 1 and ${max}.` };
    }
  }
  return { ok: true };
};

const firstNonEmptyString = (...values: readonly unknown[]): string | undefined =>
  values.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim();
