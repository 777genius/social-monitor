import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { ScanJob, ScanJobStatus } from '../../domain';
import type {
  ListScanJobsBySourceBindingResult,
  ListScanJobsBySourceBindingWindowResult,
  ScanJobHistoryReadPort,
  ScanJobRepositoryPort,
} from '../../ports';

export class InMemoryScanJobRepository implements ScanJobRepositoryPort, ScanJobHistoryReadPort {
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

  async restoreScanJob(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly scanJobId: string;
    readonly previous: ScanJob | null;
  }): Promise<void> {
    const idKey = this.idKey(
      params.tenantId,
      params.workspaceId,
      params.scanJobId,
    );
    const current = this.jobsById.get(idKey);

    if (current !== undefined) {
      const snapshot = current.toSnapshot();
      this.jobsByIdempotencyKey.delete(
        this.key(
          snapshot.tenantId,
          snapshot.workspaceId,
          snapshot.idempotencyKey,
        ),
      );
    }

    if (params.previous === null) {
      this.jobsById.delete(idKey);
      return;
    }

    const previousSnapshot = params.previous.toSnapshot();
    this.jobsById.set(idKey, params.previous);
    this.jobsByIdempotencyKey.set(
      this.key(
        previousSnapshot.tenantId,
        previousSnapshot.workspaceId,
        previousSnapshot.idempotencyKey,
      ),
      params.previous,
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
    const jobs = this.sortedJobsBySourceBinding(params);

    return jobs[0] ?? null;
  }

  async listBySourceBinding(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    sourceBindingId: string;
    limit: number;
    cursor?: string;
    statuses?: readonly ScanJobStatus[];
  }): Promise<ListScanJobsBySourceBindingResult> {
    const jobs = this.sortedJobsBySourceBinding(params).filter((job) =>
      params.statuses === undefined ||
      params.statuses.includes(job.toSnapshot().status),
    );
    const startIndex = params.cursor === undefined
      ? 0
      : Math.max(
          0,
          jobs.findIndex((job) => job.toSnapshot().id === params.cursor) + 1,
        );
    const page = jobs.slice(startIndex, startIndex + params.limit);
    const next = jobs[startIndex + params.limit];

    return {
      scanJobs: page,
      nextCursor: next?.toSnapshot().id,
    };
  }

  async listBySourceBindingWindow(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    sourceBindingId: string;
    windowStartedAt: Date;
    windowEndedAt: Date;
    limit: number;
  }): Promise<ListScanJobsBySourceBindingWindowResult> {
    const jobs = this.sortedJobsBySourceBinding(params)
      .filter((job) => {
        const requestedAt = job.toSnapshot().requestedAt.getTime();

        return (
          requestedAt >= params.windowStartedAt.getTime() &&
          requestedAt < params.windowEndedAt.getTime()
        );
      });
    const page = jobs.slice(0, params.limit);

    return {
      scanJobs: page,
      truncated: jobs.length > params.limit,
    };
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

  private sortedJobsBySourceBinding(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly sourceBindingId: string;
  }): readonly ScanJob[] {
    return [...this.jobsById.values()]
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
  }
}
