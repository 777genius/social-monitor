import type { TenantId, UserId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { WorkspaceRole } from './workspace-authorization-policy.port';

export type UserAccessTokenPrincipal = {
  readonly subject: UserId;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly roles: readonly WorkspaceRole[];
  readonly issuer: string;
  readonly audience: readonly string[];
  readonly tokenId?: string;
};

export interface UserAccessTokenVerifierPort {
  verify(token: string): Promise<UserAccessTokenPrincipal>;
}

export const USER_ACCESS_TOKEN_VERIFIER = Symbol('USER_ACCESS_TOKEN_VERIFIER');
