import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { ScanJob } from '../../domain';
import type { ScanJobRepositoryPort } from '../../ports';

export class InMemoryScanJobRepository implements ScanJobRepositoryPort {
  private readonly jobsByIdempotencyKey = new Map<string, ScanJob>();
  private readonly jobsById = new Map<string, ScanJob>();

  async save(job: ScanJob): Promise<void> {
    const snapshot = job.toSnapshot();
    this.jobsById.set(this.idKey(snapshot.tenantId, snapshot.workspaceId, snapshot.id), job);
    this.jobsByIdempotencyKey.set(
      this.key(snapshot.tenantId, snapshot.workspaceId, snapshot.idempotencyKey),
      job,
    );
  }

  async findById(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    scanJobId: string;
  }): Promise<ScanJob | null> {
    return this.jobsById.get(this.idKey(params.tenantId, params.workspaceId, params.scanJobId)) ?? null;
  }

  async findActiveBySourceBinding(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    sourceBindingId: string;
  }): Promise<ScanJob | null> {
    return (
      [...this.jobsById.values()].find((job) => {
        const snapshot = job.toSnapshot();

        return (
          snapshot.tenantId === params.tenantId &&
          snapshot.workspaceId === params.workspaceId &&
          snapshot.sourceBindingId === params.sourceBindingId &&
          (snapshot.status === 'requested' || snapshot.status === 'enqueued')
        );
      }) ?? null
    );
  }

  async findLatestBySourceBinding(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    sourceBindingId: string;
  }): Promise<ScanJob | null> {
    const jobs = [...this.jobsById.values()]
      .filter((job) => {
        const snapshot = job.toSnapshot();

        return (
          snapshot.tenantId === params.tenantId &&
          snapshot.workspaceId === params.workspaceId &&
          snapshot.sourceBindingId === params.sourceBindingId
        );
      })
      .sort((left, right) => {
        const leftSnapshot = left.toSnapshot();
        const rightSnapshot = right.toSnapshot();
        const requestedDiff = rightSnapshot.requestedAt.getTime() - leftSnapshot.requestedAt.getTime();

        if (requestedDiff !== 0) {
          return requestedDiff;
        }

        return rightSnapshot.id.localeCompare(leftSnapshot.id);
      });

    return jobs[0] ?? null;
  }

  async findByIdempotencyKey(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    idempotencyKey: string;
  }): Promise<ScanJob | null> {
    return this.jobsByIdempotencyKey.get(this.key(params.tenantId, params.workspaceId, params.idempotencyKey)) ?? null;
  }

  private key(tenantId: TenantId, workspaceId: WorkspaceId, idempotencyKey: string): string {
    return `${tenantId}:${workspaceId}:${idempotencyKey}`;
  }

  private idKey(tenantId: TenantId, workspaceId: WorkspaceId, scanJobId: string): string {
    return `${tenantId}:${workspaceId}:${scanJobId}`;
  }
}
