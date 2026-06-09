import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';
import type { Result } from '@social-monitor/shared-kernel';
import type { DomainError } from '@social-monitor/shared-kernel';

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer';

export type WorkspaceAction =
  | 'api_keys.create'
  | 'api_keys.list'
  | 'api_keys.revoke'
  | 'feed.read'
  | 'topics.create'
  | 'source_bindings.create'
  | 'scan_policies.set'
  | 'scan_jobs.read'
  | 'scan_requests.create'
  | 'summaries.read'
  | 'summary_requests.create'
  | 'summary_regenerations.create'
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

export const parseWorkspaceRolesHeader = (header: string | undefined): readonly string[] =>
  (header ?? '')
    .split(',')
    .map((role) => role.trim().toLowerCase())
    .filter((role) => role.length > 0);
