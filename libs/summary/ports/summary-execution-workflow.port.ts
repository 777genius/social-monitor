import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { SummaryArtifact, SummaryJob, SummaryReadyEvent } from '../domain';

/** An adapter-owned row version. Consumers retain it unchanged for one execution. */
export type SummaryExecutionVersion = string & { readonly __summaryExecutionVersion: unique symbol };

export type SummaryExecutionClaim = {
  readonly job: SummaryJob;
  readonly version: SummaryExecutionVersion;
};

export type StartSummaryExecution = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly summaryJobId: string;
  readonly startedAt: Date;
};

export type CompleteSummaryExecution = {
  readonly execution: SummaryExecutionClaim;
  readonly artifact: SummaryArtifact;
  readonly event: SummaryReadyEvent;
  readonly completedAt: Date;
};

export type FailSummaryExecution = {
  readonly execution: SummaryExecutionClaim;
  readonly failedAt: Date;
  readonly failureReason: string;
};

export interface SummaryExecutionWorkflowPort {
  /** Claims requested/failed jobs atomically. Running executions are never stolen. */
  tryStart(command: StartSummaryExecution): Promise<SummaryExecutionClaim | null>;
  /** Atomically stores artifact, terminal job and durable event intent, or stores none. */
  complete(command: CompleteSummaryExecution): Promise<SummaryJob | null>;
  /** Only the same still-running row version can be failed. */
  fail(command: FailSummaryExecution): Promise<boolean>;
}
