import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { ApiKey, type ApiKeyProps, type ApiKeyScope, type ApiKeyStatus } from '../../../domain';

export type PrismaApiKeyCredentialStatus = 'ACTIVE' | 'REVOKED';

export type PrismaApiKeyCredentialRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly keyPrefix: string;
  readonly secretHash: string;
  readonly scopes: readonly string[];
  readonly status: PrismaApiKeyCredentialStatus;
  readonly createdAt: Date;
  readonly revokedAt: Date | null;
};

const apiKeyScopes = [
  'read:topics',
  'read:feed',
  'read:summaries',
  'read:delivery_status',
  'read:webhook_endpoints',
  'write:webhook_endpoints',
] as const satisfies readonly ApiKeyScope[];

export const apiKeyFromPrisma = (record: PrismaApiKeyCredentialRecord): ApiKey =>
  ApiKey.rehydrate({
    id: record.id,
    tenantId: tenantId(record.tenantId),
    workspaceId: workspaceId(record.workspaceId),
    name: record.name,
    keyPrefix: record.keyPrefix,
    secretHash: record.secretHash,
    scopes: record.scopes.map(apiKeyScopeFromPrisma),
    status: apiKeyStatusFromPrisma(record.status),
    createdAt: record.createdAt,
    revokedAt: record.revokedAt ?? undefined,
  } satisfies ApiKeyProps);

export const apiKeyStatusToPrisma = (status: ApiKeyStatus): PrismaApiKeyCredentialStatus =>
  status === 'active' ? 'ACTIVE' : 'REVOKED';

const apiKeyStatusFromPrisma = (status: PrismaApiKeyCredentialStatus): ApiKeyStatus =>
  status === 'ACTIVE' ? 'active' : 'revoked';

const apiKeyScopeFromPrisma = (scope: string): ApiKeyScope => {
  if ((apiKeyScopes as readonly string[]).includes(scope)) {
    return scope as ApiKeyScope;
  }

  throw new Error(`Unknown API key scope from Prisma: ${scope}`);
};
