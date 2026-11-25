import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';
import type { SourceBindingConfig } from '../../ports/source-binding-config-protector.port';

export type BindSourceCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly interestId: string;
  readonly providerKey: string;
  readonly config: SourceBindingConfig;
  readonly idempotencyKey: string;
  readonly correlationId: string;
};
