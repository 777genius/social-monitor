import type { EventEnvelope } from '@social-monitor/shared-kernel';

export interface SummaryEventPublisherPort {
  publish(event: EventEnvelope<Readonly<Record<string, unknown>>>): Promise<void>;
}
