import type { RealtimeEventProps } from '../../domain/entities/realtime-event';

export const READER_SUMMARY_READY_CONSUMER = 'delivery.reader_summary.ready.v1';
export type ReaderSummaryReadyProjection = Omit<RealtimeEventProps, 'id' | 'sequence' | 'replayCursor'> & {
  readonly sourceEventId: string;
};
export interface ReaderSummaryReadyProjectionStore {
  // Commit the inbox identity and replay event together, or neither. A duplicate
  // must match the original projection, including workspace and resource scope.
  project(projection: ReaderSummaryReadyProjection): Promise<{
    readonly realtimeEventId: string;
    readonly channel: string;
    readonly sequence: number;
    readonly duplicate: boolean;
  }>;
}
