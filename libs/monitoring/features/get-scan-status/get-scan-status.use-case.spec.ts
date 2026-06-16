import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { ScanJob, type ScanJob as ScanJobEntity } from '../../domain';
import type {
  FindScanExecutionAttemptQuery,
  ScanExecutionAttemptReadPort,
  ScanExecutionAttemptSnapshot,
  ScanJobRepositoryPort,
} from '../../ports';
import { GetScanStatusUseCase } from './get-scan-status.use-case';

class FakeScanJobs implements ScanJobRepositoryPort {
  private readonly jobsById = new Map<string, ScanJobEntity>();
  private readonly jobsByIdempotencyKey = new Map<string, ScanJobEntity>();

  async save(job: ScanJobEntity): Promise<void> {
    const snapshot = job.toSnapshot();
    this.jobsById.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`, job);
    this.jobsByIdempotencyKey.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.idempotencyKey}`, job);
  }

  async findById(params: Parameters<ScanJobRepositoryPort['findById']>[0]): Promise<ScanJobEntity | null> {
    return this.jobsById.get(`${params.tenantId}:${params.workspaceId}:${params.scanJobId}`) ?? null;
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

  async findByIdempotencyKey(
    params: Parameters<ScanJobRepositoryPort['findByIdempotencyKey']>[0],
  ): Promise<ScanJobEntity | null> {
    return this.jobsByIdempotencyKey.get(`${params.tenantId}:${params.workspaceId}:${params.idempotencyKey}`) ?? null;
  }
}

class FakeScanExecutionAttempts implements ScanExecutionAttemptReadPort {
  constructor(private readonly latestAttempt: ScanExecutionAttemptSnapshot | null = null) {}

  async findLatestByScanJob(query: FindScanExecutionAttemptQuery): Promise<ScanExecutionAttemptSnapshot | null> {
    if (this.latestAttempt === null) {
      return null;
    }

    return (
      this.latestAttempt.tenantId === query.tenantId &&
      this.latestAttempt.workspaceId === query.workspaceId &&
      this.latestAttempt.scanJobId === query.scanJobId
    )
      ? this.latestAttempt
      : null;
  }
}

const makeJob = () =>
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

describe('GetScanStatusUseCase', () => {
  it('returns current scan job status', async () => {
    const jobs = new FakeScanJobs();
    await jobs.save(makeJob());
    const useCase = new GetScanStatusUseCase(jobs, new FakeScanExecutionAttempts());

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      scanJobId: 'scan-job-1',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        scanJobId: 'scan-job-1',
        sourceBindingId: 'binding-1',
        scanPolicyId: 'policy-1',
        status: 'enqueued',
        requestedAt: new Date('2026-06-06T00:00:00.000Z'),
        enqueuedAt: new Date('2026-06-06T00:00:01.000Z'),
        completedAt: undefined,
        failureReason: undefined,
        latestAttempt: undefined,
      },
    });
  });

  it('includes latest execution attempt counters when available', async () => {
    const jobs = new FakeScanJobs();
    await jobs.save(makeJob());
    const useCase = new GetScanStatusUseCase(
      jobs,
      new FakeScanExecutionAttempts({
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        scanJobId: 'scan-job-1',
        sourceBindingId: 'binding-1',
        status: 'succeeded',
        startedAt: new Date('2026-06-06T00:00:02.000Z'),
        finishedAt: new Date('2026-06-06T00:00:05.000Z'),
        fetched: 10,
        inserted: 7,
        skippedDuplicates: 2,
        projected: 7,
      }),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      scanJobId: 'scan-job-1',
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.latestAttempt).toEqual({
      sourceBindingId: 'binding-1',
      status: 'succeeded',
      startedAt: new Date('2026-06-06T00:00:02.000Z'),
      finishedAt: new Date('2026-06-06T00:00:05.000Z'),
      fetched: 10,
      inserted: 7,
      skippedDuplicates: 2,
      projected: 7,
      failureReason: undefined,
    });
  });

  it('returns not found for a missing scan job in tenant scope', async () => {
    const useCase = new GetScanStatusUseCase(new FakeScanJobs(), new FakeScanExecutionAttempts());

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      scanJobId: 'missing',
    });

    expect(result.ok).toBe(false);
  });
});
