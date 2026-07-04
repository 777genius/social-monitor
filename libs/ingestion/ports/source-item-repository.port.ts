import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { SourceItem } from '../domain';

export type SaveSourceItemsCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly providerKey: string;
  readonly items: readonly SourceItem[];
};

export type SavedSourceItemRef = {
  readonly externalId: string;
  readonly sourceItemId: string;
  readonly inserted: boolean;
};

export type SaveSourceItemsResult = {
  readonly inserted: number;
  readonly skippedDuplicates: number;
  readonly items: readonly SavedSourceItemRef[];
};

// Raised when a repository implementation violates the saveBatch contract,
// e.g. returns a mismatched or conflicting set of saved item refs.
export class SourceItemPersistenceContractError extends Error {
  override readonly name = 'SourceItemPersistenceContractError';
}

export interface SourceItemRepositoryPort {
  saveBatch(command: SaveSourceItemsCommand): Promise<SaveSourceItemsResult>;
}
