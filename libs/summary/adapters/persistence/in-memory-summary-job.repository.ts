import type { SummaryJob } from '../../domain';
import type { SummaryJobRepositoryPort } from '../../ports';

export class InMemorySummaryJobRepository implements SummaryJobRepositoryPort {
  private readonly jobsByIdempotencyKey = new Map<string, SummaryJob>();

  async save(job: SummaryJob): Promise<void> {
    const snapshot = job.toSnapshot();
    this.jobsByIdempotencyKey.set(
      `${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.idempotencyKey}`,
      job,
    );
  }

  async findByIdempotencyKey(
    params: Parameters<SummaryJobRepositoryPort['findByIdempotencyKey']>[0],
  ): Promise<SummaryJob | null> {
    return this.jobsByIdempotencyKey.get(`${params.tenantId}:${params.workspaceId}:${params.idempotencyKey}`) ?? null;
  }
}
