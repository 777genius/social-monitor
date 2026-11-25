export type RetentionPurgePlanEntry = {
  readonly table: string;
  readonly dataClass: string;
  readonly owner: string;
  readonly retentionDays: number;
  readonly eligibleBefore: Date;
  readonly deleteMode: string;
  readonly purgeTrigger: string;
  readonly legalHoldBehavior: 'skip_purge_and_record_exception';
  readonly exportable: boolean;
};

export type RetentionRetainedTableEntry = {
  readonly table: string;
  readonly dataClass: string;
  readonly owner: string;
  readonly deleteMode: string;
  readonly reason: string;
};

export type PlanRetentionPurgeResult = {
  readonly plannedAt: Date;
  readonly runbook: string;
  readonly purgePlans: readonly RetentionPurgePlanEntry[];
  readonly retainedTables: readonly RetentionRetainedTableEntry[];
};
