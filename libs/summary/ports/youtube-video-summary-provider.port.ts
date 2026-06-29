import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { SummaryConfidence, SummaryUsage } from '../domain';

export type YoutubeVideoSummaryProviderName = 'disabled' | 'deterministic-local' | 'google-gemini';

export type YoutubeVideoSummaryRequest = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly interestId: string;
  readonly feedItemId: string;
  readonly sourceItemId: string;
  readonly sourceBindingId: string;
  readonly url: string;
  readonly title: string;
  readonly bodyPreview?: string;
  readonly observedAt: Date;
};

export type YoutubeVideoSummaryResult = {
  readonly provider: YoutubeVideoSummaryProviderName | string;
  readonly model: string;
  readonly promptVersion: string;
  readonly summary: string;
  readonly keyPoints: readonly string[];
  readonly chapters: readonly YoutubeVideoSummaryChapter[];
  readonly followUpQuestions: readonly string[];
  readonly confidence: SummaryConfidence;
  readonly usage: SummaryUsage;
};

export type YoutubeVideoSummaryChapter = {
  readonly startTime?: string;
  readonly title: string;
  readonly summary: string;
};

export interface YoutubeVideoSummaryProviderPort {
  readonly providerName: YoutubeVideoSummaryProviderName | string;
  supports(url: string): boolean;
  summarize(request: YoutubeVideoSummaryRequest): Promise<YoutubeVideoSummaryResult | null>;
}
