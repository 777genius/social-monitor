import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { RelevanceWeight } from '../../domain';

export type UpsertUserRelevanceProfileCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly userId: string;
  readonly topicWeights?: readonly RelevanceWeight[];
  readonly sourceWeights?: readonly RelevanceWeight[];
  readonly keywordWeights?: readonly RelevanceWeight[];
  readonly mutedKeywords?: readonly string[];
  readonly blockedProviderKeys?: readonly string[];
};
