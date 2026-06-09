import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type {
  WorkspaceAction,
  WorkspaceAuthorizationPolicyPort,
  WorkspaceAuthorizationRequest,
  WorkspaceRole,
} from '../../ports';

const allowedRolesByAction: Record<WorkspaceAction, readonly WorkspaceRole[]> = {
  'api_keys.create': ['owner', 'admin'],
  'api_keys.list': ['owner', 'admin'],
  'api_keys.revoke': ['owner', 'admin'],
  'topics.create': ['owner', 'admin'],
};

const workspaceRoles = new Set<WorkspaceRole>(['owner', 'admin', 'member', 'viewer']);

export class StaticWorkspaceAuthorizationPolicy implements WorkspaceAuthorizationPolicyPort {
  authorize(request: WorkspaceAuthorizationRequest): Result<void, DomainError> {
    const roles = normalizeRoles(request.roles);

    if (roles.length === 0) {
      return err(new DomainError('authorization.denied', 'Workspace role is required', {
        action: request.action,
      }));
    }

    const allowedRoles = allowedRolesByAction[request.action];
    const isAllowed = roles.some((role) => allowedRoles.includes(role));

    if (!isAllowed) {
      return err(new DomainError('authorization.denied', 'Workspace role is not allowed for this action', {
        action: request.action,
        requiredRoles: allowedRoles,
      }));
    }

    return ok(undefined);
  }
}

const normalizeRoles = (roles: readonly string[]): readonly WorkspaceRole[] =>
  [...new Set(roles
    .map((role) => role.trim().toLowerCase())
    .filter((role): role is WorkspaceRole => workspaceRoles.has(role as WorkspaceRole)))]
    .sort((left, right) => left.localeCompare(right));
