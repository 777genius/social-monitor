import type { Clock } from '@social-monitor/shared-kernel';
import type { SourceProviderScanContext, SourceProviderScanResult } from '../../../ports';
import type { TelegramPreviewClientPort, TelegramPreviewPost } from './telegram-preview-client.port';
import { TelegramSourceProvider } from './telegram-source.provider';

export const telegramClock: Clock = { now: () => new Date('2026-10-18T12:00:00Z') };
export const telegramContext = (config: Record<string, unknown> = {}): SourceProviderScanContext => ({
  tenantId: 'tenant-example', workspaceId: 'workspace-example', sourceBindingId: 'binding-example',
  scanJobId: 'scan-example', correlationId: 'correlation-example', config,
});
export const telegramPost = (id: number, overrides: Partial<TelegramPreviewPost> = {}): TelegramPreviewPost => ({
  id, text: `Example release ${id}`, publishedAt: new Date('2026-10-18T10:00:00Z'), links: [], incomplete: false, ...overrides,
});
export const telegramClient = (posts: readonly TelegramPreviewPost[], pageSize = 3): TelegramPreviewClientPort => ({
  readPage: async (_channel, before) => ({
    posts: posts.filter((post) => before === undefined || post.id < before).sort((a, b) => b.id - a.id).slice(0, pageSize), warnings: [],
  }),
});
export const scanTelegram = (provider: TelegramSourceProvider, cursor?: string, config: Record<string, unknown> = {}): Promise<SourceProviderScanResult> => {
  const context = telegramContext(config);
  return provider.scan({ ...provider.planScan({ mode: 'account_feed', query: '@example_channel' }, context), cursor }, context);
};
export const telegramHtml = (body: string, channel = 'example_channel'): string =>
  `<html><body><div class="tgme_channel_info_header_username">@${channel}</div><section class="tgme_channel_history">${body}</section></body></html>`;
export const telegramMessageHtml = (id: number, body: string, extra = ''): string =>
  `<div class="tgme_widget_message" data-post="example_channel/${id}"><div class="tgme_widget_message_text js-message_text">${body}</div><a class="tgme_widget_message_date"><time datetime="2026-10-18T10:00:00Z"></time></a>${extra}</div>`;
