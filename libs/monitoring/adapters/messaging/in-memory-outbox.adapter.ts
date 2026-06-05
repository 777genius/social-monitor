import type { EventEnvelope } from '@social-monitor/shared-kernel';

import type { OutboxPort } from '../../ports';

export class InMemoryOutboxAdapter implements OutboxPort {
  private readonly events: EventEnvelope<Readonly<Record<string, unknown>>>[] = [];

  async append(event: EventEnvelope<Readonly<Record<string, unknown>>>): Promise<void> {
    this.events.push(event);
  }

  all(): readonly EventEnvelope<Readonly<Record<string, unknown>>>[] {
    return [...this.events];
  }
}
