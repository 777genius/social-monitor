export type RecordRealtimeEventResult = {
  readonly eventId: string;
  readonly sequence: number;
  readonly replayCursor: string;
};
