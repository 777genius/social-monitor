import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { SourceCredential } from '../domain';

export type ListSourceCredentialsQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly providerKey?: string;
  readonly limit: number;
  readonly cursor?: string;
};

export type ListSourceCredentialsResult = {
  readonly sourceCredentials: readonly SourceCredential[];
  readonly nextCursor?: string;
};

export interface SourceCredentialRepositoryPort {
  save(credential: SourceCredential): Promise<void>;
  findById(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly sourceCredentialId: string;
  }): Promise<SourceCredential | null>;
  list(query: ListSourceCredentialsQuery): Promise<ListSourceCredentialsResult>;
}
