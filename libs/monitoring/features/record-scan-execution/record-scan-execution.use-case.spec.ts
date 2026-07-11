import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { ScanJob, type ScanJob as ScanJobEntity } from '../../domain';
import type { ScanJobRepositoryPort } from '../../ports';
import { RecordScanExecutionUseCase } from './record-scan-execution.use-case';

class FakeScanJobs implements ScanJobRepositoryPort {
  private readonly jobsById = new Map<string, ScanJobEntity>();
  private readonly jobsByIdempotencyKey = new Map<string, ScanJobEntity>();

  async save(job: ScanJobEntity): Promise<void> {
    const snapshot = job.toSnapshot();
    this.jobsById.set(
      `${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`,
      job,
    );
    this.jobsByIdempotencyKey.set(
      `${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.idempotencyKey}`,
      job,
    );
  }

  async findById(
    params: Parameters<ScanJobRepositoryPort['findById']>[0],
  ): Promise<ScanJobEntity | null> {
    return (
      this.jobsById.get(
        `${params.tenantId}:${params.workspaceId}:${params.scanJobId}`,
      ) ?? null
    );
  }

  async findActiveBySourceBinding(
    params: Parameters<ScanJobRepositoryPort['findActiveBySourceBinding']>[0],
  ): Promise<ScanJobEntity | null> {
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

  async findLatestBySourceBinding(
    params: Parameters<ScanJobRepositoryPort['findLatestBySourceBinding']>[0],
  ): Promise<ScanJobEntity | null> {
    const jobs = [...this.jobsById.values()]
      .filter((job) => {
        const snapshot = job.toSnapshot();

        return (
          snapshot.tenantId === params.tenantId &&
          snapshot.workspaceId === params.workspaceId &&
          snapshot.sourceBindingId === params.sourceBindingId
        );
      })
      .sort(
        (left, right) =>
          right.toSnapshot().requestedAt.getTime() -
          left.toSnapshot().requestedAt.getTime(),
      );

    return jobs[0] ?? null;
  }

  async findByIdempotencyKey(
    params: Parameters<ScanJobRepositoryPort['findByIdempotencyKey']>[0],
  ): Promise<ScanJobEntity | null> {
    return (
      this.jobsByIdempotencyKey.get(
        `${params.tenantId}:${params.workspaceId}:${params.idempotencyKey}`,
      ) ?? null
    );
  }
}

const makeEnqueuedJob = () =>
  ScanJob.request({
    id: 'scan-job-1',
    tenantId: tenantId('tenant-1'),
    workspaceId: workspaceId('workspace-1'),
    sourceBindingId: 'binding-1',
    scanPolicyId: 'policy-1',
    idempotencyKey: 'scan-1',
    requestedAt: new Date('2026-06-06T00:00:00.000Z'),
  }).markEnqueued({
    enqueuedAt: new Date('2026-06-06T00:00:01.000Z'),
  });

describe('RecordScanExecutionUseCase', () => {
  it('marks enqueued scan job as succeeded', async () => {
    const jobs = new FakeScanJobs();
    await jobs.save(makeEnqueuedJob());
    const useCase = new RecordScanExecutionUseCase(jobs);

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      scanJobId: 'scan-job-1',
      status: 'succeeded',
      completedAt: new Date('2026-06-06T00:00:02.000Z'),
      executionMetadata: {
        schemaVersion: 1,
        providerKey: 'reddit',
        acceptedItemCount: 20,
      },
    });

    expect(result).toEqual({
      ok: true,
      value: {
        scanJobId: 'scan-job-1',
        status: 'succeeded',
      },
    });
    expect(
      (
        await jobs.findById({
          tenantId: tenantId('tenant-1'),
          workspaceId: workspaceId('workspace-1'),
          scanJobId: 'scan-job-1',
        })
      )?.toSnapshot(),
    ).toMatchObject({
      status: 'succeeded',
      completedAt: new Date('2026-06-06T00:00:02.000Z'),
      executionMetadata: {
        schemaVersion: 1,
        providerKey: 'reddit',
        acceptedItemCount: 20,
      },
    });
  });

  it('marks enqueued scan job as failed with reason', async () => {
    const jobs = new FakeScanJobs();
    await jobs.save(makeEnqueuedJob());
    const useCase = new RecordScanExecutionUseCase(jobs);

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      scanJobId: 'scan-job-1',
      status: 'failed',
      completedAt: new Date('2026-06-06T00:00:02.000Z'),
      failureReason: 'Provider unavailable',
      failureMetadata: {
        providerKey: 'x-twitter',
        kind: 'rate_limited',
        retryAfterMs: 900_000,
        rateLimitResetAt: '2026-06-06T00:15:00.000Z',
      },
      executionMetadata: {
        schemaVersion: 1,
        providerKey: 'x-twitter',
        status: 'failed',
        rateLimitEventCount: 1,
      },
    });

    expect(result).toEqual({
      ok: true,
      value: {
        scanJobId: 'scan-job-1',
        status: 'failed',
      },
    });
    expect(
      (
        await jobs.findById({
          tenantId: tenantId('tenant-1'),
          workspaceId: workspaceId('workspace-1'),
          scanJobId: 'scan-job-1',
        })
      )?.toSnapshot(),
    ).toMatchObject({
      status: 'failed',
      failureReason: 'Provider unavailable',
      failureMetadata: {
        providerKey: 'x-twitter',
        kind: 'rate_limited',
        retryAfterMs: 900_000,
        rateLimitResetAt: '2026-06-06T00:15:00.000Z',
      },
      executionMetadata: {
        schemaVersion: 1,
        providerKey: 'x-twitter',
        status: 'failed',
        rateLimitEventCount: 1,
      },
    });
  });

  it('returns not found for a missing scan job', async () => {
    const useCase = new RecordScanExecutionUseCase(new FakeScanJobs());

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      scanJobId: 'missing',
      status: 'succeeded',
      completedAt: new Date('2026-06-06T00:00:02.000Z'),
    });

    expect(result.ok).toBe(false);
  });
});
