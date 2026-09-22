import type { RetainedPromotionAuthority } from "@social-monitor/feed/domain/value-objects/retained-promotion-authority";
import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

import type {
  ReaderSummaryPeriod,
  ReaderSummaryScope,
  SummaryEvidenceItem,
  SummaryEvidenceSelection,
} from "../domain";

export type ReaderSummaryEvidenceSelectionParams = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scope: ReaderSummaryScope;
  readonly period: ReaderSummaryPeriod;
  readonly userId?: string;
  readonly subscriptionId?: string;
  readonly maxItems: number;
  readonly observedThrough?: Date;
  readonly retainedEngagementAuthority?: RetainedPromotionAuthority;
  readonly timestampPolicy?: ReaderSummaryTimestampPolicy;
};

export interface ReaderSummaryEvidenceSelectorPort {
  select(params: ReaderSummaryEvidenceSelectionParams): Promise<SummaryEvidenceSelection>;
}

/** Reads appendix evidence without running the legacy promotion slate. */
export interface ReaderSummarySupplementalEvidenceSelectorPort {
  selectSupplemental(params: ReaderSummaryEvidenceSelectionParams): Promise<
    readonly SummaryEvidenceItem[]
  >;
}

export type ReaderSummaryTimestampPolicy = "published_at" | "observed_at";
