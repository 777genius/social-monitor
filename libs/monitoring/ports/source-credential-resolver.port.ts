import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';
import type { DomainError, Result } from '@social-monitor/shared-kernel';

import type { SourceCredentialSecret } from './source-credential-vault.port';

export interface SourceCredentialResolverPort {
  resolve(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly sourceCredentialId: string;
    readonly providerKey?: string;
  }): Promise<Result<SourceCredentialSecret, DomainError | Error>>;
}
