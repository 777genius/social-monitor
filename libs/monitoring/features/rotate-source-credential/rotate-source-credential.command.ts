import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { SourceCredentialSecret } from '../../ports';

export type RotateSourceCredentialCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly sourceCredentialId: string;
  readonly secret: SourceCredentialSecret;
  readonly secretPreview?: string;
  readonly scopes?: readonly string[];
  readonly expiresAt?: Date;
};
