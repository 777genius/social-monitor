export type ScheduledAutoSummaryResultItem = {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly interestId: string;
  readonly summaryJobId: string;
  readonly status: string;
  readonly created: boolean;
  readonly idempotencyKey: string;
  readonly latestFeedItemObservedAt: string;
  readonly newFeedItemCount: number;
};

export type ScheduleAutoSummariesResult = {
  readonly evaluated: number;
  readonly scheduled: number;
  readonly existing: number;
  readonly failed: number;
  readonly summaries: readonly ScheduledAutoSummaryResultItem[];
  readonly failures: readonly {
    readonly interestId: string;
    readonly message: string;
  }[];
};
