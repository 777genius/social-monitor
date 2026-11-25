import type { ApiKey, ApiKeyProps } from '../../domain';

export type ApiKeyView = Omit<ApiKeyProps, 'secretHash' | 'createdAt' | 'revokedAt'> & {
  readonly createdAt: string;
  readonly revokedAt?: string;
};

export const presentApiKey = (apiKey: ApiKey): ApiKeyView => {
  const snapshot = apiKey.toSnapshot();

  return {
    id: snapshot.id,
    tenantId: snapshot.tenantId,
    workspaceId: snapshot.workspaceId,
    name: snapshot.name,
    keyPrefix: snapshot.keyPrefix,
    scopes: snapshot.scopes,
    status: snapshot.status,
    createdAt: snapshot.createdAt.toISOString(),
    revokedAt: snapshot.revokedAt?.toISOString(),
  };
};
