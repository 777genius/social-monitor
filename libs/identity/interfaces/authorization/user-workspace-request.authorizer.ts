import { Inject, Injectable } from '@nestjs/common';
import {
  USER_ACCESS_TOKEN_VERIFIER,
  USER_WORKSPACE_MEMBERSHIP_VERIFIER,
  WORKSPACE_AUTHORIZATION_POLICY,
  type UserAccessTokenVerifierPort,
  type UserWorkspaceMembership,
  type UserWorkspaceMembershipVerifierPort,
  type WorkspaceAction,
  type WorkspaceAuthorizationPolicyPort,
  type WorkspaceRole,
} from '@social-monitor/identity/ports';
import { DomainError, type TenantId, type UserId, type WorkspaceId } from '@social-monitor/shared-kernel';

import { parseBearerToken } from './bearer-authorization';

export type UserWorkspaceRequestAuthorization = {
  readonly actorType: 'user';
  readonly actorId: string;
  readonly userId: UserId;
  readonly roles: readonly WorkspaceRole[];
  readonly membershipSource: UserWorkspaceMembership['source'];
};

export type AuthorizeUserWorkspaceRequestParams = {
  readonly authorizationHeader: string | undefined;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly operation: WorkspaceAction;
};

@Injectable()
export class UserWorkspaceRequestAuthorizer {
  constructor(
    @Inject(USER_ACCESS_TOKEN_VERIFIER)
    private readonly userAccessTokenVerifier: UserAccessTokenVerifierPort,
    @Inject(USER_WORKSPACE_MEMBERSHIP_VERIFIER)
    private readonly userWorkspaceMembershipVerifier: UserWorkspaceMembershipVerifierPort,
    @Inject(WORKSPACE_AUTHORIZATION_POLICY)
    private readonly workspaceAuthorization: WorkspaceAuthorizationPolicyPort,
  ) {}

  async authorize(params: AuthorizeUserWorkspaceRequestParams): Promise<UserWorkspaceRequestAuthorization> {
    const bearerToken = parseBearerToken(params.authorizationHeader);

    if (bearerToken.startsWith('smk_')) {
      throw new DomainError('authorization.denied', 'Bearer JWT authorization is required');
    }

    const principal = await this.userAccessTokenVerifier.verify(bearerToken);

    if (principal.tenantId !== params.tenantId || principal.workspaceId !== params.workspaceId) {
      throw new DomainError('authorization.denied', 'Bearer JWT tenant or workspace does not match request scope');
    }

    const membership = await this.userWorkspaceMembershipVerifier.verify({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      userId: principal.subject,
      tokenRoles: principal.roles,
    });

    if (membership === null) {
      throw new DomainError('authorization.denied', 'Bearer JWT workspace membership is missing');
    }

    const authorization = this.workspaceAuthorization.authorize({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      action: params.operation,
      roles: membership.roles,
    });

    if (!authorization.ok) {
      throw authorization.error;
    }

    return {
      actorType: 'user',
      actorId: principal.subject,
      userId: principal.subject,
      roles: membership.roles,
      membershipSource: membership.source,
    };
  }
}
