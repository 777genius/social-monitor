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
