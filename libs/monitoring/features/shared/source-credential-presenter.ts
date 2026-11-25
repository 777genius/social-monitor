import type { SourceCredential, SourceCredentialProps } from '../../domain';

export type SourceCredentialView = Omit<SourceCredentialProps, 'secretKeyId' | 'createdAt' | 'updatedAt' | 'rotatedAt' | 'revokedAt' | 'expiresAt'> & {
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly rotatedAt?: string;
  readonly revokedAt?: string;
  readonly expiresAt?: string;
};

export const presentSourceCredential = (credential: SourceCredential): SourceCredentialView => {
  const snapshot = credential.toSnapshot();

  return {
    id: snapshot.id,
    tenantId: snapshot.tenantId,
    workspaceId: snapshot.workspaceId,
    providerKey: snapshot.providerKey,
    kind: snapshot.kind,
    status: snapshot.status,
    secretPreview: snapshot.secretPreview,
    scopes: snapshot.scopes,
    expiresAt: snapshot.expiresAt?.toISOString(),
    createdAt: snapshot.createdAt.toISOString(),
    updatedAt: snapshot.updatedAt.toISOString(),
    rotatedAt: snapshot.rotatedAt?.toISOString(),
    revokedAt: snapshot.revokedAt?.toISOString(),
  };
};
