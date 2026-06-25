import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { FeedSignalBaselineSample } from '../domain';

export const FEED_SIGNAL_BASELINE_REPOSITORY = Symbol('FEED_SIGNAL_BASELINE_REPOSITORY');

export type FeedSignalBaselineCohortFilter = {
  readonly providerKey: string;
  readonly sourceKey: string;
  readonly contentType: string;
};

export type ListFeedSignalBaselineSamplesQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly topicId?: string;
  readonly observedAfter: Date;
  readonly limit: number;
  readonly cohortFilters?: readonly FeedSignalBaselineCohortFilter[];
};

export interface FeedSignalBaselineRepositoryPort {
  listSamples(query: ListFeedSignalBaselineSamplesQuery): Promise<readonly FeedSignalBaselineSample[]>;
}
