export type RetentionDeleteMode =
  | 'soft_delete_then_hard_delete'
  | 'soft_delete_then_anonymize'
  | 'hard_delete_after_account_closure'
  | 'retain_until_catalog_deprecated'
  | 'hard_delete_after_source_binding_deleted'
  | 'hard_delete_after_replay_window'
  | 'hard_delete_or_tombstone_if_referenced'
  | 'tombstone_then_hard_delete'
  | 'hard_delete_after_retention'
  | 'hard_delete_or_anonymize'
  | 'retain_for_audit_then_anonymize'
  | 'hard_delete_after_published_and_replay_window'
  | 'hard_delete_after_expiry';

export type RetentionTablePolicy = {
  readonly table: string;
  readonly dataClass: string;
  readonly owner: string;
  readonly retentionDays: number;
  readonly deleteMode: RetentionDeleteMode;
  readonly exportable: boolean;
  readonly legalHoldAware: boolean;
  readonly purgeTrigger: string;
};

export type RetentionPolicySet = {
  readonly schemaVersion: 1;
  readonly defaultLegalHoldBehavior: 'skip_purge_and_record_exception';
  readonly runbook: string;
  readonly tables: readonly RetentionTablePolicy[];
};

export interface RetentionPolicyRepositoryPort {
  load(): Promise<RetentionPolicySet>;
}
