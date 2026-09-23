import type { RealtimeEvent, RealtimeEventProps } from '../../domain';

export const SUMMARY_READY_CONSUMER = 'delivery.summary.ready.v1';

export type SummaryReadyProjection = Omit<RealtimeEventProps, 'id' | 'sequence' | 'replayCursor'> & {
  readonly sourceEventId: string;
  // Source fields not present in the public replay payload still participate
  // in collision checks through the replay ID.
  readonly sourceIdentityHash: string;
};

export interface SummaryReadyProjectionStore {
  // The inbox identity and replay event commit together. Replays return the
  // committed event so fanout can resend its original identity and sequence.
  project(projection: SummaryReadyProjection): Promise<RealtimeEvent>;
}
