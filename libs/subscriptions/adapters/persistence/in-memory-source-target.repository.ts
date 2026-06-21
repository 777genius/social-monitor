import type { SourceTarget } from '../../domain';
import type { SourceTargetRepositoryPort } from '../../ports';

export class InMemorySourceTargetRepository implements SourceTargetRepositoryPort {
  private readonly targetsById = new Map<string, SourceTarget>();
  private readonly targetsByNormalizedKey = new Map<string, SourceTarget>();

  async save(target: SourceTarget): Promise<void> {
    const snapshot = target.toSnapshot();
    this.targetsById.set(this.idKey(snapshot), target);
    this.targetsByNormalizedKey.set(this.normalizedKey(snapshot), target);
  }

  async findById(params: Parameters<SourceTargetRepositoryPort['findById']>[0]): Promise<SourceTarget | null> {
    return this.targetsById.get(`${params.tenantId}:${params.workspaceId}:${params.sourceTargetId}`) ?? null;
  }

  async findByNormalizedKey(
    query: Parameters<SourceTargetRepositoryPort['findByNormalizedKey']>[0],
  ): Promise<SourceTarget | null> {
    return this.targetsByNormalizedKey.get(
      `${query.tenantId}:${query.workspaceId}:${query.providerKey}:${query.normalizedKey}`,
    ) ?? null;
  }

  private idKey(snapshot: ReturnType<SourceTarget['toSnapshot']>): string {
    return `${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`;
  }

  private normalizedKey(snapshot: ReturnType<SourceTarget['toSnapshot']>): string {
    return `${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.providerKey}:${snapshot.normalizedKey}`;
  }
}
