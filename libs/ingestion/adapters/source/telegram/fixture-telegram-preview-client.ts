import type { TelegramPreviewClientPort, TelegramPreviewPage } from './telegram-preview-client.port';
import type { Clock } from '@social-monitor/shared-kernel';

/** Synthetic messages only. Never exercises Telegram or credentials in tests. */
export class FixtureTelegramPreviewClient implements TelegramPreviewClientPort {
  constructor(private readonly clock: Clock) {}
  async readPage(_channel: string, beforeId?: number): Promise<TelegramPreviewPage> {
    if (beforeId !== undefined) return { posts: [], warnings: [] };
    return { posts: [{ id: 1, text: 'Example engineering release\n\nPublic fixture update.',
      publishedAt: this.clock.now(), links: [], incomplete: false }], warnings: [] };
  }
}
