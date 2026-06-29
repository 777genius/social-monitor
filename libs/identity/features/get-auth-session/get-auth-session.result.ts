import type { TenantId, UserId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { WorkspaceRole } from '../../ports';

export type AuthSessionUserRole = 'admin' | 'user';

export type AuthSessionWorkspaceView = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly tenantName: string;
  readonly workspaceName: string;
  readonly workspaceRole: WorkspaceRole;
  readonly statusLabel: string;
};

export type GetAuthSessionResult = {
  readonly userId: UserId;
  readonly userLabel: string;
  readonly userRole: AuthSessionUserRole;
  readonly selectedWorkspace: AuthSessionWorkspaceView;
  readonly workspaces: readonly AuthSessionWorkspaceView[];
};
