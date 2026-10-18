import { TelegramPreviewError } from './telegram-preview-client.port';

export type TelegramBackfill = {
  readonly beforeId: number;
  readonly ceilingId: number;
  readonly floorId: number;
  readonly fromTime: number;
  readonly untilTime: number;
};
export type TelegramPreviewCursor = {
  readonly version: 1;
  readonly channel: string;
  readonly scope: string;
  readonly lastId: number;
  readonly retryAfterUntil?: number;
  readonly pending?: TelegramBackfill;
  readonly historyGap?: { readonly afterId: number; readonly beforeId: number };
};
const prefix = 'telegram.preview.v1:';
const safeId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

export const readTelegramCursor = (raw: string | undefined, channel: string, scope: string): TelegramPreviewCursor => {
  const empty: TelegramPreviewCursor = { version: 1, channel, scope, lastId: 0 };
  if (raw === undefined) return empty;
  try {
    if (raw.length > 4096 || !raw.startsWith(prefix)) throw new Error('format');
    const value: unknown = JSON.parse(Buffer.from(raw.slice(prefix.length), 'base64url').toString('utf8'));
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('shape');
    const cursor = value as Record<string, unknown>;
    if (Object.keys(cursor).some((key) => !['version', 'channel', 'scope', 'lastId', 'pending', 'retryAfterUntil', 'historyGap'].includes(key)) ||
        cursor.version !== 1 || cursor.channel !== channel || typeof cursor.scope !== 'string' || !safeId(cursor.lastId)) throw new Error('identity');
    if (cursor.retryAfterUntil !== undefined && !safeId(cursor.retryAfterUntil)) throw new Error('retry');
    if (cursor.historyGap !== undefined) {
      const gap = cursor.historyGap as Record<string, unknown> | null;
      if (gap === null || typeof gap !== 'object' || Array.isArray(gap) ||
          Object.keys(gap).sort().join(',') !== 'afterId,beforeId' ||
          !safeId(gap.afterId) || !safeId(gap.beforeId) || gap.afterId >= gap.beforeId) throw new Error('gap');
    }
    if (cursor.pending !== undefined) {
      if (cursor.pending === null || typeof cursor.pending !== 'object' || Array.isArray(cursor.pending)) throw new Error('pending');
      const pending = cursor.pending as Record<string, unknown>;
      if (Object.keys(pending).sort().join(',') !== 'beforeId,ceilingId,floorId,fromTime,untilTime' ||
          !safeId(pending.beforeId) || !safeId(pending.ceilingId) || !safeId(pending.floorId) ||
          pending.beforeId <= pending.floorId || pending.ceilingId < pending.beforeId || pending.floorId !== cursor.lastId ||
          !safeId(pending.fromTime) || !safeId(pending.untilTime) || pending.fromTime >= pending.untilTime) throw new Error('bounds');
    }
    // Explicit historical windows are separate scan scopes; never reuse their
    // watermark as the live channel checkpoint (or vice versa).
    if (cursor.scope === scope) return cursor as unknown as TelegramPreviewCursor;
    const previous = cursor as unknown as TelegramPreviewCursor;
    // A changed explicit window cannot silently erase an unfinished range.
    return { ...empty,
      ...(previous.retryAfterUntil === undefined ? {} : { retryAfterUntil: previous.retryAfterUntil }),
      ...(previous.pending === undefined && previous.historyGap === undefined ? {} : {
      historyGap: previous.historyGap ?? { afterId: previous.lastId, beforeId: previous.pending!.ceilingId },
    }) };
  } catch {
    throw new TelegramPreviewError('Invalid Telegram preview cursor or channel binding', 'invalid_query', false);
  }
};

export const writeTelegramCursor = (cursor: TelegramPreviewCursor): string =>
  prefix + Buffer.from(JSON.stringify(cursor)).toString('base64url');
