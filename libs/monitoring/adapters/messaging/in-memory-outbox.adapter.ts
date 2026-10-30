import type { EventEnvelope } from '@social-monitor/shared-kernel';

import type { OutboxPort } from '../../ports';
import { InMemoryInterestCreationState } from '../persistence/in-memory-interest-creation-state';

export class InMemoryOutboxAdapter implements OutboxPort {
  constructor(private readonly state = new InMemoryInterestCreationState()) {}

  private get events() { return this.state.events; }

  async append(event: EventEnvelope<Readonly<Record<string, unknown>>>): Promise<void> {
    this.events.push(event);
  }

  all(): readonly EventEnvelope<Readonly<Record<string, unknown>>>[] {
    return [...this.events];
  }

  appendCheckpoint(eventId: string): number {
    return this.events.filter((event) => event.eventId === eventId).length;
  }

  async rollbackAppend(eventId: string, checkpoint: number): Promise<void> {
    let currentCount = this.appendCheckpoint(eventId);

    for (
      let index = this.events.length - 1;
      index >= 0 && currentCount > checkpoint;
      index -= 1
    ) {
      if (this.events[index]?.eventId === eventId) {
        this.events.splice(index, 1);
        currentCount -= 1;
      }
    }
  }
}
