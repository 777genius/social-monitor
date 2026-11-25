import type { RealtimeEvent } from '../domain';

export interface RealtimeFanoutPort {
  publish(event: RealtimeEvent): Promise<void>;
}
