import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { SourceCredentialKind } from '../../domain';
import type { SourceCredentialSecret } from '../../ports';

export type CreateSourceCredentialCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly providerKey: string;
  readonly kind: SourceCredentialKind;
  readonly secret: SourceCredentialSecret;
  readonly secretPreview?: string;
  readonly scopes?: readonly string[];
  readonly expiresAt?: Date;
};
