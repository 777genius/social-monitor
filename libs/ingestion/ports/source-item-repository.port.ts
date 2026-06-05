import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { SourceItem } from '../domain';

export type SaveSourceItemsCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly items: readonly SourceItem[];
};

export type SaveSourceItemsResult = {
  readonly inserted: number;
  readonly skippedDuplicates: number;
};

export interface SourceItemRepositoryPort {
  saveBatch(command: SaveSourceItemsCommand): Promise<SaveSourceItemsResult>;
}
