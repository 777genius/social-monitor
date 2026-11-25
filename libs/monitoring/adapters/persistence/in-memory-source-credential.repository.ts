import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { SourceCredential } from '../../domain';
import type {
  ListSourceCredentialsQuery,
  ListSourceCredentialsResult,
  SourceCredentialRepositoryPort,
} from '../../ports';
import { encodeOffsetCursor, parseOffsetCursor } from './offset-pagination';

export class InMemorySourceCredentialRepository implements SourceCredentialRepositoryPort {
  private readonly credentialsById = new Map<string, SourceCredential>();

  async save(credential: SourceCredential): Promise<void> {
    const snapshot = credential.toSnapshot();

    this.credentialsById.set(this.idKey(snapshot.tenantId, snapshot.workspaceId, snapshot.id), credential);
  }

  async findById(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly sourceCredentialId: string;
  }): Promise<SourceCredential | null> {
    return this.credentialsById.get(this.idKey(params.tenantId, params.workspaceId, params.sourceCredentialId)) ?? null;
  }

  async list(query: ListSourceCredentialsQuery): Promise<ListSourceCredentialsResult> {
    const offset = parseOffsetCursor(query.cursor);
    const limit = Math.max(1, Math.min(query.limit, 100));
    const allCredentials = [...this.credentialsById.values()]
      .filter((credential) => {
        const snapshot = credential.toSnapshot();

        return snapshot.tenantId === query.tenantId &&
          snapshot.workspaceId === query.workspaceId &&
          (query.providerKey === undefined || snapshot.providerKey === query.providerKey);
      })
      .sort(compareSourceCredentialsByUpdate);
    const sourceCredentials = allCredentials.slice(offset, offset + limit);
    const nextOffset = offset + sourceCredentials.length;

    return {
      sourceCredentials,
      nextCursor: nextOffset < allCredentials.length ? encodeOffsetCursor(nextOffset) : undefined,
    };
  }

  private idKey(tenantId: TenantId, workspaceId: WorkspaceId, sourceCredentialId: string): string {
    return `${tenantId}:${workspaceId}:${sourceCredentialId}`;
  }
}

const compareSourceCredentialsByUpdate = (left: SourceCredential, right: SourceCredential): number => {
  const leftSnapshot = left.toSnapshot();
  const rightSnapshot = right.toSnapshot();
  const updatedDiff = rightSnapshot.updatedAt.getTime() - leftSnapshot.updatedAt.getTime();

  if (updatedDiff !== 0) {
    return updatedDiff;
  }

  return rightSnapshot.id.localeCompare(leftSnapshot.id);
};
