import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

import type { PromotionSnapshotPreparationObserver } from "./promotion-snapshot-preparation";

export type RankFeedItemsCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly userId?: string;
  readonly interestId?: string;
  readonly limit: number;
  readonly observedAfter?: Date;
  readonly observedAtOrAfter?: Date;
  readonly observedAtOrBefore?: Date;
  readonly observedBefore?: Date;
  readonly publishedAtOrAfter?: Date;
  readonly publishedBefore?: Date;
  readonly promotionAssessmentExecution?: { readonly deadlineAtMs: number; readonly signal?: AbortSignal };
  readonly observePromotionPreparation?: PromotionSnapshotPreparationObserver;
  readonly rankingProfile?: "reader_post_promotion";
};
