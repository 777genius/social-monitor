import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type {
  UserAccessTokenVerifierPort,
  UserWorkspaceMembershipVerifierPort,
} from '../../ports';
import type { GetAuthSessionQuery } from './get-auth-session.query';
import type { GetAuthSessionResult } from './get-auth-session.result';
import { resolveAuthSessionUserRole } from './auth-session-user-role.policy';

type GetAuthSessionFailure = DomainError;

export class GetAuthSessionUseCase {
  constructor(
    private readonly userAccessTokens: UserAccessTokenVerifierPort,
    private readonly workspaceMemberships: UserWorkspaceMembershipVerifierPort,
  ) {}

  async execute(query: GetAuthSessionQuery): Promise<Result<GetAuthSessionResult, GetAuthSessionFailure>> {
    const accessToken = query.accessToken.trim();
    if (accessToken.length === 0 || accessToken.startsWith('smk_')) {
      return err(new DomainError('authorization.denied', 'Bearer JWT user session is required'));
    }

    try {
      const principal = await this.userAccessTokens.verify(accessToken);
      const membership = await this.workspaceMemberships.verify({
        tenantId: principal.tenantId,
        workspaceId: principal.workspaceId,
        userId: principal.subject,
        tokenRoles: principal.roles,
      });

      const workspaceRole = membership?.roles[0];
      if (membership === null || workspaceRole === undefined) {
        return err(new DomainError('authorization.denied', 'Bearer JWT workspace membership is missing'));
      }

      const selectedWorkspace = {
        tenantId: principal.tenantId,
        workspaceId: principal.workspaceId,
        tenantName: principal.tenantId,
        workspaceName: principal.workspaceId,
        workspaceRole,
        statusLabel: 'Active',
      };

      return ok({
        userId: principal.subject,
        userLabel: principal.subject,
        userRole: resolveAuthSessionUserRole(membership.roles),
        selectedWorkspace,
        workspaces: [selectedWorkspace],
      });
    } catch (error) {
      if (error instanceof DomainError) {
        return err(error);
      }
      throw error;
    }
  }
}
