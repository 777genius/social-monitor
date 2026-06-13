import type { RealtimeEvent } from '../../domain';
import type {
  ListRealtimeEventsQuery,
  ListRealtimeEventsResult,
  RealtimeEventRepositoryPort,
} from '../../ports';

const REPLAY_WINDOW_SIZE = 100;

type ScopeState = {
  readonly events: readonly RealtimeEvent[];
  readonly lastSequence: number;
};

export class InMemoryRealtimeEventRepository implements RealtimeEventRepositoryPort {
  private readonly statesByScope = new Map<string, ScopeState>();

  async nextSequence(params: Parameters<RealtimeEventRepositoryPort['nextSequence']>[0]): Promise<number> {
    return (this.statesByScope.get(scopeKey(params))?.lastSequence ?? 0) + 1;
  }

  async append(event: RealtimeEvent): Promise<void> {
    const snapshot = event.toSnapshot();
    const key = scopeKey(snapshot);
    const current = this.statesByScope.get(key);
    const events = [...(current?.events ?? []), event].slice(-REPLAY_WINDOW_SIZE);

    this.statesByScope.set(key, {
      events,
      lastSequence: Math.max(current?.lastSequence ?? 0, snapshot.sequence),
    });
  }

  async list(query: ListRealtimeEventsQuery): Promise<ListRealtimeEventsResult> {
    const state = this.statesByScope.get(scopeKey(query)) ?? { events: [], lastSequence: 0 };
    const cursor = parseCursor(query.cursor);

    if (cursor === null || cursor.afterSequence > state.lastSequence) {
      return {
        events: [],
        resyncRequired: true,
      };
    }

    const oldestSequence = state.events[0]?.toSnapshot().sequence;
    if (query.cursor !== undefined && oldestSequence !== undefined && cursor.afterSequence < oldestSequence - 1) {
      return {
        events: [],
        resyncRequired: true,
      };
    }

    const selected = state.events
      .filter((event) => event.toSnapshot().sequence > cursor.afterSequence)
      .slice(0, query.limit);
    const lastSelectedSequence = selected.at(-1)?.toSnapshot().sequence;

    return {
      events: selected,
      nextCursor: lastSelectedSequence !== undefined && lastSelectedSequence < state.lastSequence
        ? encodeCursor(lastSelectedSequence)
        : undefined,
      resyncRequired: false,
    };
  }
}

const scopeKey = (params: { readonly tenantId: string; readonly workspaceId: string; readonly channel: string }): string =>
  `${params.tenantId}:${params.workspaceId}:${params.channel}`;

const encodeCursor = (afterSequence: number): string => Buffer
  .from(JSON.stringify({ afterSequence }))
  .toString('base64url');

const parseCursor = (cursor: string | undefined): { readonly afterSequence: number } | null => {
  if (cursor === undefined) {
    return { afterSequence: 0 };
  }

  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
      afterSequence?: unknown;
      offset?: unknown;
    };
    const afterSequence = parsed.afterSequence ?? parsed.offset;

    if (typeof afterSequence === 'number' && Number.isInteger(afterSequence) && afterSequence >= 0) {
      return { afterSequence };
    }
  } catch {
    return null;
  }

  return null;
};
