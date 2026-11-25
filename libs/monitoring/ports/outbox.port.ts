import type { EventEnvelope } from '@social-monitor/shared-kernel';

export interface OutboxPort {
  append(event: EventEnvelope<Readonly<Record<string, unknown>>>): Promise<void>;
}
