import { type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { SourceCredential } from '../domain';
import type {
  ListSourceCredentialsQuery,
  ListSourceCredentialsResult,
  SourceCredentialRefreshPort,
  SourceCredentialRefreshResult,
  SourceCredentialRepositoryPort,
  SourceCredentialSecret,
  SourceCredentialVaultPort,
} from '../ports';

export const sourceCredentialTenant = tenantId('tenant-source-credential-test');
export const sourceCredentialWorkspace = workspaceId('workspace-source-credential-test');

export class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `source-credential-test-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

export class FakeSourceCredentialRepository implements SourceCredentialRepositoryPort {
  private readonly credentials = new Map<string, SourceCredential>();

  async save(credential: SourceCredential): Promise<void> {
    const snapshot = credential.toSnapshot();
    this.credentials.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`, credential);
  }

  async findById(
    params: Parameters<SourceCredentialRepositoryPort['findById']>[0],
  ): Promise<SourceCredential | null> {
    return this.credentials.get(`${params.tenantId}:${params.workspaceId}:${params.sourceCredentialId}`) ?? null;
  }

  async list(query: ListSourceCredentialsQuery): Promise<ListSourceCredentialsResult> {
    const sourceCredentials = [...this.credentials.values()].filter((credential) => {
      const snapshot = credential.toSnapshot();

      return (
        snapshot.tenantId === query.tenantId &&
        snapshot.workspaceId === query.workspaceId &&
        (query.providerKey === undefined || snapshot.providerKey === query.providerKey)
      );
    }).slice(0, query.limit);

    return { sourceCredentials };
  }
}

export class FakeSourceCredentialVault implements SourceCredentialVaultPort {
  readonly secrets = new Map<string, SourceCredentialSecret>();

  async put(params: Parameters<SourceCredentialVaultPort['put']>[0]): Promise<void> {
    this.secrets.set(params.secretKeyId, params.secret);
  }

  async get(params: Parameters<SourceCredentialVaultPort['get']>[0]): Promise<SourceCredentialSecret | null> {
    return this.secrets.get(params.secretKeyId) ?? null;
  }

  async delete(params: Parameters<SourceCredentialVaultPort['delete']>[0]): Promise<void> {
    this.secrets.delete(params.secretKeyId);
  }
}

export class FakeSourceCredentialRefresher implements SourceCredentialRefreshPort {
  constructor(private readonly result: SourceCredentialRefreshResult) {}

  async refreshIfNeeded(): Promise<SourceCredentialRefreshResult> {
    return this.result;
  }
}

export const createStoredSourceCredential = async (params: {
  readonly repository: FakeSourceCredentialRepository;
  readonly vault: FakeSourceCredentialVault;
  readonly id?: string;
  readonly secretKeyId?: string;
  readonly providerKey?: string;
  readonly secret?: SourceCredentialSecret;
  readonly expiresAt?: Date;
}): Promise<SourceCredential> => {
  const secretKeyId = params.secretKeyId ?? 'source-credential-secret-test';
  const credential = SourceCredential.create({
    id: params.id ?? 'source-credential-test',
    tenantId: sourceCredentialTenant,
    workspaceId: sourceCredentialWorkspace,
    providerKey: params.providerKey ?? 'reddit',
    kind: 'oauth2',
    secretKeyId,
    secretPreview: 'test-token',
    scopes: ['read'],
    expiresAt: params.expiresAt,
    createdAt: new Date('2026-06-21T10:00:00.000Z'),
  });

  await params.vault.put({
    secretKeyId,
    secret: params.secret ?? { accessToken: 'test-access-token' },
  });
  await params.repository.save(credential);

  return credential;
};
