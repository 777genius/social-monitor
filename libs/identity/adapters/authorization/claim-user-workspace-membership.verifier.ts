import type { UserWorkspaceMembershipVerifierPort } from '../../ports';

export class ClaimUserWorkspaceMembershipVerifier implements UserWorkspaceMembershipVerifierPort {
  async verify(
    params: Parameters<UserWorkspaceMembershipVerifierPort['verify']>[0],
  ): Promise<Awaited<ReturnType<UserWorkspaceMembershipVerifierPort['verify']>>> {
    if (params.tokenRoles.length === 0) {
      return null;
    }

    return {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      userId: params.userId,
      roles: params.tokenRoles,
      source: 'token_claim',
    };
  }
}
