import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { FetchedConversationUnit } from './source-provider.port';
import type { ProjectedFeedItemRef } from './feed-projection.port';

export type ProjectConversationUnitsCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly interestId: string;
  readonly sourceBindingId: string;
  readonly providerKey: string;
  readonly observedAt: Date;
  readonly conversationUnits: readonly FetchedConversationUnit[];
  readonly projectedFeedItems: readonly ProjectedFeedItemRef[];
};

export type ProjectConversationUnitsResult = {
  readonly projected: number;
  readonly skippedOrphans: number;
  readonly skippedInvalid: number;
};

export interface ConversationProjectionPort {
  project(
    command: ProjectConversationUnitsCommand,
  ): Promise<ProjectConversationUnitsResult>;
}

export const noopConversationProjection: ConversationProjectionPort = {
  async project(
    command: ProjectConversationUnitsCommand,
  ): Promise<ProjectConversationUnitsResult> {
    return {
      projected: 0,
      skippedOrphans: command.conversationUnits.length,
      skippedInvalid: 0,
    };
  },
};
