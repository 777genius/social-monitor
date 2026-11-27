import type { DueDigestContinuation } from './schedule-due-digests.command';

export type ScheduledDigestResultItem = {
  readonly digestScheduleId: string;
  readonly digestId: string;
  readonly deliveryAttemptId?: string;
  readonly created: boolean;
};

export type ScheduleDueDigestsResult = {
  readonly scannedAt: Date;
  readonly continuation?: DueDigestContinuation;
  readonly evaluated: number;
  readonly assembled: number;
  readonly skipped: number;
  readonly digests: readonly ScheduledDigestResultItem[];
  readonly failures?: readonly { readonly digestScheduleId: string; readonly message: string }[];
};
