import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

import type {
  ReaderSummaryPeriod,
  ReaderSummaryScope,
  SummaryEvidenceSelection,
} from "../domain";

export interface ReaderSummaryEvidenceSelectorPort {
  select(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly scope: ReaderSummaryScope;
    readonly period: ReaderSummaryPeriod;
    readonly userId?: string;
    readonly subscriptionId?: string;
    readonly maxItems: number;
    readonly observedThrough?: Date;
  }): Promise<SummaryEvidenceSelection>;
}
