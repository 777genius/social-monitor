import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { ApiKeyScope } from '../../domain';

export type CreateApiKeyCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly name: string;
  readonly scopes: readonly ApiKeyScope[];
};
