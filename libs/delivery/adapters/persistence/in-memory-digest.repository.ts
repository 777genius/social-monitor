import type { Digest } from '../../domain';
import type { DigestRepositoryPort } from '../../ports';

export class InMemoryDigestRepository implements DigestRepositoryPort {
  private readonly digestsById = new Map<string, Digest>();
  private readonly digestsByWindow = new Map<string, Digest>();

  async save(digest: Digest): Promise<void> {
    const snapshot = digest.toSnapshot();

    this.digestsById.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`, digest);
    this.digestsByWindow.set(
      [
        snapshot.tenantId,
        snapshot.workspaceId,
        snapshot.recipientKey,
        snapshot.channel,
        snapshot.window.windowId,
      ].join(':'),
      digest,
    );
  }

  async findById(params: Parameters<DigestRepositoryPort['findById']>[0]): Promise<Digest | null> {
    return this.digestsById.get(`${params.tenantId}:${params.workspaceId}:${params.digestId}`) ?? null;
  }

  async findByWindow(params: Parameters<DigestRepositoryPort['findByWindow']>[0]): Promise<Digest | null> {
    return this.digestsByWindow.get([
      params.tenantId,
      params.workspaceId,
      params.recipientKey,
      params.channel,
      params.windowId,
    ].join(':')) ?? null;
  }
}
