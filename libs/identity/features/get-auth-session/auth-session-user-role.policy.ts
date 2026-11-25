import type { WorkspaceRole } from '../../ports';
import type { AuthSessionUserRole } from './get-auth-session.result';

const elevatedWorkspaceRoles = new Set<WorkspaceRole>(['owner', 'admin']);

export const resolveAuthSessionUserRole = (
  workspaceRoles: readonly WorkspaceRole[],
): AuthSessionUserRole =>
  workspaceRoles.some((role) => elevatedWorkspaceRoles.has(role))
    ? 'admin'
    : 'user';
