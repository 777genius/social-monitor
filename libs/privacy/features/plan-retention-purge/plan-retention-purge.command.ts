export type PlanRetentionPurgeCommand = {
  readonly now: Date;
  readonly includeRetainedTables?: boolean;
};
