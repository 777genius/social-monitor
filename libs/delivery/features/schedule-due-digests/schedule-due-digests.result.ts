export type ScheduledDigestResultItem = {
  readonly digestScheduleId: string;
  readonly digestId: string;
  readonly deliveryAttemptId?: string;
  readonly created: boolean;
};

export type ScheduleDueDigestsResult = {
  readonly scannedAt: Date;
  readonly evaluated: number;
  readonly assembled: number;
  readonly skipped: number;
  readonly digests: readonly ScheduledDigestResultItem[];
};
