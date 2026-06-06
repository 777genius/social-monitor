import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { Digest } from '../domain';

export interface DigestRepositoryPort {
  save(digest: Digest): Promise<void>;
  findById(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    digestId: string;
  }): Promise<Digest | null>;
  findByWindow(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    recipientKey: string;
    channel: string;
    windowId: string;
  }): Promise<Digest | null>;
}
