import type { SummaryArtifact } from '../../domain';
import type { SummaryArtifactRepositoryPort } from '../../ports';

export class InMemorySummaryArtifactRepository implements SummaryArtifactRepositoryPort {
  private readonly artifactsById = new Map<string, SummaryArtifact>();

  async save(artifact: SummaryArtifact): Promise<void> {
    const snapshot = artifact.toSnapshot();
    this.artifactsById.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.summaryId}`, artifact);
  }

  async findById(
    params: Parameters<SummaryArtifactRepositoryPort['findById']>[0],
  ): Promise<SummaryArtifact | null> {
    return this.artifactsById.get(`${params.tenantId}:${params.workspaceId}:${params.summaryId}`) ?? null;
  }
}
