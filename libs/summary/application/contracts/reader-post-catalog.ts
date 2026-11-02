import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

/** Larger candidate windows must return a choose-shorter-period conflict, never a partial list. */
export const READER_POST_CANDIDATE_BUDGET = 2_000;

export type ReaderPost = {
  readonly id: string;
  readonly sourceItemId: string;
  readonly providerKey: string;
  readonly providerFamily: string;
  readonly title: string;
  readonly bodyPreview: string;
  readonly canonicalUrl: string;
  readonly publishedAt: string;
  readonly engagement: number | null;
  /** Raw X likes only; null means unknown, absent for other providers. */
  readonly likeCount?: number | null;
  readonly engagementObservedAt: string | null;
  readonly usefulness: string | null;
  readonly relevance: string | null;
  /** Missing external quote context, independent of the authored text assessment. */
  readonly quotedContext?: "not_captured";
};

export type ReaderPostWindow = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly interestId?: string;
  readonly startedAt: Date;
  readonly endedAt: Date;
};

/** All visible collected posts, including those outside the editorial slate. */
export interface ReaderPostCatalog {
  read(window: ReaderPostWindow): Promise<readonly ReaderPost[]>;
}
