import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { ConversationSignalBaselineSample } from '../domain';

export const CONVERSATION_SIGNAL_BASELINE_REPOSITORY = Symbol(
  'CONVERSATION_SIGNAL_BASELINE_REPOSITORY',
);

export type ConversationSignalBaselineCohortFilter = {
  readonly providerKey: string;
  readonly sourceKey: string;
  readonly contentType: string;
};

export type ListConversationSignalBaselineSamplesQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly interestId?: string;
  readonly observedAfter: Date;
  readonly limit: number;
  readonly cohortFilters?: readonly ConversationSignalBaselineCohortFilter[];
};

export interface ConversationSignalBaselineRepositoryPort {
  listSamples(
    query: ListConversationSignalBaselineSamplesQuery,
  ): Promise<readonly ConversationSignalBaselineSample[]>;
}
