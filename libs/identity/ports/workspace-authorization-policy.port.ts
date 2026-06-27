import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';
import type { Result } from '@social-monitor/shared-kernel';
import type { DomainError } from '@social-monitor/shared-kernel';

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer';

export type WorkspaceAction =
  | 'api_keys.create'
  | 'api_keys.list'
  | 'api_keys.revoke'
  | 'reader_summary_jobs.read'
  | 'reader_summary_requests.create'
  | 'reader-summaries.read'
  | 'delivery_attempts.read'
  | 'delivery_attempts.retry'
  | 'digest_schedules.create'
  | 'digest_schedules.read'
  | 'digests.read'
  | 'feed.read'
  | 'notification_preferences.read'
  | 'notification_preferences.write'
  | 'public_api_audit.read'
  | 'realtime_events.read'
  | 'scan_dead_letters.read'
  | 'topics.create'
  | 'topics.read'
  | 'source_bindings.create'
  | 'source_bindings.read'
  | 'source_bindings.update_status'
  | 'scan_policies.read'
  | 'scan_policies.set'
  | 'scan_jobs.read'
  | 'scan_requests.create'
  | 'summaries.read'
  | 'summary_feedback.create'
  | 'summary_feedback.read'
  | 'summary_jobs.read'
  | 'summary_policies.read'
  | 'summary_policies.set'
  | 'summary_requests.create'
  | 'summary_regenerations.create'
  | 'user_subscriptions.read'
  | 'user_subscriptions.create'
  | 'user_summary_preferences.read'
  | 'user_summary_preferences.set'
  | 'webhook_endpoints.read'
  | 'webhook_endpoints.create'
  | 'webhook_endpoints.disable';

export type WorkspaceAuthorizationRequest = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly action: WorkspaceAction;
  readonly roles: readonly string[];
};

export interface WorkspaceAuthorizationPolicyPort {
  authorize(request: WorkspaceAuthorizationRequest): Result<void, DomainError>;
}

export const WORKSPACE_AUTHORIZATION_POLICY = Symbol('WORKSPACE_AUTHORIZATION_POLICY');

export type WorkspaceRoleHeaderEnv = {
  readonly NODE_ENV?: string;
  readonly SOCIAL_MONITOR_RUNTIME_PROFILE?: string;
  readonly TRUSTED_WORKSPACE_ROLE_HEADER?: string;
};

export const parseWorkspaceRolesHeader = (
  header: string | undefined,
  env: WorkspaceRoleHeaderEnv,
): readonly string[] => {
  if (!trustedWorkspaceRoleHeaderEnabled(env)) {
    return [];
  }

  return (header ?? '')
    .split(',')
    .map((role) => role.trim().toLowerCase())
    .filter((role) => role.length > 0);
};

export const trustedWorkspaceRoleHeaderEnabled = (
  env: WorkspaceRoleHeaderEnv,
): boolean => {
  const nodeEnv = env.NODE_ENV ?? 'development';
  const runtimeProfile = env.SOCIAL_MONITOR_RUNTIME_PROFILE;

  if (runtimeProfile === 'beta' || nodeEnv === 'staging' || nodeEnv === 'production') {
    return false;
  }

  if (env.TRUSTED_WORKSPACE_ROLE_HEADER !== undefined) {
    return env.TRUSTED_WORKSPACE_ROLE_HEADER === 'enabled';
  }

  return nodeEnv === 'development' || nodeEnv === 'test';
};
