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
  'delivery_attempts.read': ['owner', 'admin', 'member', 'viewer'],
  'digest_schedules.create': ['owner', 'admin', 'member'],
  'digest_schedules.read': ['owner', 'admin', 'member', 'viewer'],
  'digests.read': ['owner', 'admin', 'member', 'viewer'],
  'feed.read': ['owner', 'admin', 'member', 'viewer'],
  'notification_preferences.read': ['owner', 'admin', 'member', 'viewer'],
  'notification_preferences.write': ['owner', 'admin', 'member'],
  'realtime_events.read': ['owner', 'admin', 'member', 'viewer'],
  'scan_dead_letters.read': ['owner', 'admin'],
  'topics.create': ['owner', 'admin'],
  'topics.read': ['owner', 'admin', 'member', 'viewer'],
  'source_bindings.create': ['owner', 'admin'],
  'source_bindings.read': ['owner', 'admin', 'member', 'viewer'],
  'source_bindings.update_status': ['owner', 'admin'],
  'scan_policies.read': ['owner', 'admin', 'member', 'viewer'],
  'scan_policies.set': ['owner', 'admin'],
  'scan_jobs.read': ['owner', 'admin', 'member', 'viewer'],
  'scan_requests.create': ['owner', 'admin', 'member'],
  'summaries.read': ['owner', 'admin', 'member', 'viewer'],
  'summary_feedback.create': ['owner', 'admin', 'member', 'viewer'],
  'summary_jobs.read': ['owner', 'admin', 'member', 'viewer'],
  'summary_requests.create': ['owner', 'admin', 'member'],
  'summary_regenerations.create': ['owner', 'admin', 'member'],
  'webhook_endpoints.read': ['owner', 'admin', 'member', 'viewer'],
  'webhook_endpoints.create': ['owner', 'admin'],
  'webhook_endpoints.disable': ['owner', 'admin'],
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
