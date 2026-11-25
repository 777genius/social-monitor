import type { TenantId, UserId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { WorkspaceRole } from './workspace-authorization-policy.port';

export type UserWorkspaceMembershipSource = 'durable' | 'token_claim';

export type UserWorkspaceMembership = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly userId: UserId;
  readonly roles: readonly WorkspaceRole[];
  readonly source: UserWorkspaceMembershipSource;
};

export type VerifyUserWorkspaceMembershipParams = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly userId: UserId;
  readonly tokenRoles: readonly WorkspaceRole[];
};

export interface UserWorkspaceMembershipVerifierPort {
  verify(params: VerifyUserWorkspaceMembershipParams): Promise<UserWorkspaceMembership | null>;
}

export const USER_WORKSPACE_MEMBERSHIP_VERIFIER = Symbol('USER_WORKSPACE_MEMBERSHIP_VERIFIER');
