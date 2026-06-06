import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { SummarySourceWindow } from '../domain';

export type SummaryEvidenceItem = {
  readonly feedItemId: string;
  readonly sourceItemId: string;
  readonly sourceBindingId: string;
  readonly title: string;
  readonly bodyPreview?: string;
  readonly canonicalUrl?: string;
  readonly observedAt: Date;
};

export type SummaryEvidenceSelection = {
  readonly sourceWindow: SummarySourceWindow;
  readonly items: readonly SummaryEvidenceItem[];
};

export interface SummaryEvidenceSelectorPort {
  select(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    topicId: string;
    maxItems: number;
  }): Promise<SummaryEvidenceSelection>;
}
