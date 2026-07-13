import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { ConversationUnit } from '../domain';

export const CONVERSATION_UNIT_REPOSITORY = Symbol('CONVERSATION_UNIT_REPOSITORY');

export type SaveConversationUnitsCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly units: readonly ConversationUnit[];
};

export type SaveConversationUnitsResult = {
  readonly saved: number;
};

export type ListConversationUnitsByRootQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly rootFeedItemIds: readonly string[];
  readonly limitPerRoot: number;
  readonly observedBefore?: Date;
};

export interface ConversationUnitRepositoryPort {
  saveBatch(command: SaveConversationUnitsCommand): Promise<SaveConversationUnitsResult>;
  listByRootFeedItemIds(query: ListConversationUnitsByRootQuery): Promise<readonly ConversationUnit[]>;
}
