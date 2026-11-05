export type TelegramPreviewPost = {
  readonly id: number;
  readonly text: string;
  readonly publishedAt?: Date;
  readonly links: readonly string[];
  readonly incomplete: boolean;
  readonly views?: number;
};

export type TelegramPreviewPage = {
  readonly posts: readonly TelegramPreviewPost[];
  readonly warnings: readonly string[];
};

export interface TelegramPreviewClientPort {
  readPage(channel: string, beforeId?: number): Promise<TelegramPreviewPage>;
}

export class TelegramPreviewError extends Error {
  constructor(
    message: string,
    readonly kind: 'invalid_query' | 'rate_limited' | 'unavailable',
    readonly retryable: boolean,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'TelegramPreviewError';
  }
}
