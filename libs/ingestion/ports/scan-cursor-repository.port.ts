import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type SaveScanCursorCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly sourceBindingId: string;
  readonly cursor: string;
  readonly committedAt: Date;
};

export type FindScanCursorQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly sourceBindingId: string;
};

export type ScanCursorRecord = SaveScanCursorCommand;

export interface ScanCursorRepositoryPort {
  save(command: SaveScanCursorCommand): Promise<void>;
  findBySourceBinding(query: FindScanCursorQuery): Promise<ScanCursorRecord | null>;
}
