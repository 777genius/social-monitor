import type { RealtimeEvent } from '../../domain';
import type {
  ListRealtimeEventsQuery,
  ListRealtimeEventsResult,
  RealtimeEventRepositoryPort,
} from '../../ports';

const REPLAY_WINDOW_SIZE = 100;

export class InMemoryRealtimeEventRepository implements RealtimeEventRepositoryPort {
  private readonly eventsByScope = new Map<string, RealtimeEvent[]>();

  async nextSequence(params: Parameters<RealtimeEventRepositoryPort['nextSequence']>[0]): Promise<number> {
    return (this.eventsByScope.get(scopeKey(params))?.length ?? 0) + 1;
  }

  async append(event: RealtimeEvent): Promise<void> {
    const snapshot = event.toSnapshot();
    const key = scopeKey(snapshot);
    const events = [...(this.eventsByScope.get(key) ?? []), event].slice(-REPLAY_WINDOW_SIZE);

    this.eventsByScope.set(key, events);
  }

  async list(query: ListRealtimeEventsQuery): Promise<ListRealtimeEventsResult> {
    const events = this.eventsByScope.get(scopeKey(query)) ?? [];
    const offset = parseCursor(query.cursor);

    if (offset === null || offset > events.length) {
      return {
        events: [],
        resyncRequired: true,
      };
    }

    const selected = events.slice(offset, offset + query.limit);
    const nextOffset = offset + selected.length;

    return {
      events: selected,
      nextCursor: nextOffset < events.length ? encodeCursor(nextOffset) : undefined,
      resyncRequired: false,
    };
  }
}

const scopeKey = (params: { readonly tenantId: string; readonly workspaceId: string; readonly channel: string }): string =>
  `${params.tenantId}:${params.workspaceId}:${params.channel}`;

const encodeCursor = (offset: number): string => Buffer.from(JSON.stringify({ offset })).toString('base64url');

const parseCursor = (cursor: string | undefined): number | null => {
  if (cursor === undefined) {
    return 0;
  }

  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { offset?: unknown };

    if (typeof parsed.offset === 'number' && Number.isInteger(parsed.offset) && parsed.offset >= 0) {
      return parsed.offset;
    }
  } catch {
    return null;
  }

  return null;
};
