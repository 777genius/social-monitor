import type {
  DomainError,
  Result,
  TenantId,
  WorkspaceId,
} from "@social-monitor/shared-kernel";

export const READER_SUMMARY_ACCEPTED_TOPIC_APPLIER = Symbol(
  "READER_SUMMARY_ACCEPTED_TOPIC_APPLIER",
);

export type ReaderSummaryAcceptedTopicApplicationStatus =
  | "not_requested"
  | "applied"
  | "already_applied"
  | "no_supported_bindings";

export type ReaderSummaryAcceptedTopicApplicationBinding = {
  readonly sourceBindingId: string;
  readonly interestId: string;
  readonly providerKey: string;
  readonly changed: boolean;
  readonly changedConfigPaths: readonly string[];
  readonly rollbackToken?: Readonly<Record<string, unknown>>;
};

export type ReaderSummaryAcceptedTopicApplication = {
  readonly status: ReaderSummaryAcceptedTopicApplicationStatus;
  readonly changedSourceBindingCount: number;
  readonly sourceBindingUpdates: readonly ReaderSummaryAcceptedTopicApplicationBinding[];
};

export type ApplyReaderSummaryAcceptedTopicCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly recommendationId: string;
  readonly topicLabel: string;
  readonly interestIds: readonly string[];
  readonly providerKeys?: readonly string[];
  readonly decidedBy: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
};

export type ReaderSummaryAcceptedTopicReversionStatus =
  | "not_requested"
  | "reverted"
  | "partially_reverted"
  | "nothing_to_revert"
  | "blocked";

export type ReaderSummaryAcceptedTopicReversionBinding = {
  readonly sourceBindingId: string;
  readonly interestId: string;
  readonly providerKey: string;
  readonly reverted: boolean;
  readonly reason?: string;
  readonly restoredConfigPaths: readonly string[];
};

export type ReaderSummaryAcceptedTopicReversion = {
  readonly status: ReaderSummaryAcceptedTopicReversionStatus;
  readonly revertedSourceBindingCount: number;
  readonly sourceBindingReversions: readonly ReaderSummaryAcceptedTopicReversionBinding[];
};

export type RevertReaderSummaryAcceptedTopicCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly recommendationId: string;
  readonly topicLabel: string;
  readonly application: ReaderSummaryAcceptedTopicApplication;
  readonly decidedBy: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
};

export interface ReaderSummaryAcceptedTopicApplierPort {
  apply(
    command: ApplyReaderSummaryAcceptedTopicCommand,
  ): Promise<Result<ReaderSummaryAcceptedTopicApplication, DomainError | Error>>;

  revert(
    command: RevertReaderSummaryAcceptedTopicCommand,
  ): Promise<Result<ReaderSummaryAcceptedTopicReversion, DomainError | Error>>;
}
