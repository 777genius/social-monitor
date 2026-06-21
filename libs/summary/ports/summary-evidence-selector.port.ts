import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { SummarySourceWindow } from '../domain';

export type SummaryEvidenceItem = {
  readonly feedItemId: string;
  readonly sourceItemId: string;
  readonly sourceBindingId: string;
  readonly providerKey: string;
  readonly title: string;
  readonly bodyPreview?: string;
  readonly canonicalUrl?: string;
  readonly extractedSummaries?: readonly SummaryEvidenceExtractedSummary[];
  readonly observedAt: Date;
};

export type SummaryEvidenceExtractedSummary = {
  readonly kind: 'youtube_video_summary';
  readonly provider: string;
  readonly model: string;
  readonly promptVersion: string;
  readonly summary: string;
  readonly keyPoints: readonly string[];
  readonly chapters: readonly SummaryEvidenceExtractedSummaryChapter[];
  readonly followUpQuestions: readonly string[];
  readonly confidenceScore: number;
};

export type SummaryEvidenceExtractedSummaryChapter = {
  readonly startTime?: string;
  readonly title: string;
  readonly summary: string;
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
