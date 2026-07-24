import type { JsonObject, TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type {
  SummaryEvidenceConversationContext,
  SummarySourceWindow,
} from '../domain';

export type {
  SummaryEvidenceConversationAncestor,
  SummaryEvidenceConversationContext,
  SummaryEvidenceConversationUnit,
} from '../domain';

export type SummaryEvidenceItem = {
  readonly feedItemId: string;
  readonly sourceItemId: string;
  readonly sourceBindingId: string;
  readonly providerKey: string;
  readonly title: string;
  readonly bodyPreview?: string;
  readonly canonicalUrl?: string;
  readonly providerMetadata?: JsonObject;
  readonly extractedSummaries?: readonly SummaryEvidenceExtractedSummary[];
  readonly conversationContext?: SummaryEvidenceConversationContext;
  readonly relevance?: SummaryEvidenceRelevance;
  readonly safety?: SummaryEvidenceSafety;
  readonly observedAt: Date;
};

export type SummaryEvidenceRelevance = {
  readonly score: number;
  readonly rank: number;
  readonly clusterId: string;
  readonly clusterSize: number;
  readonly duplicateFeedItemIds: readonly string[];
  readonly whyImportant: readonly string[];
};

export type SummaryEvidenceSafety = {
  readonly status: 'allowed' | 'sanitized' | 'blocked';
  readonly categories: readonly string[];
  readonly rawPayloadRetained: false;
  readonly retentionPolicy: 'normalized_preview_only';
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
    interestId: string;
    userId?: string;
    subscriptionId?: string;
    maxItems: number;
  }): Promise<SummaryEvidenceSelection>;
}
