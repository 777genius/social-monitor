import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { ScanJob, type ScanJob as ScanJobEntity } from '../../domain';
import type { ScanJobRepositoryPort } from '../../ports';
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

  async findByIdempotencyKey(
    params: Parameters<ScanJobRepositoryPort['findByIdempotencyKey']>[0],
  ): Promise<ScanJobEntity | null> {
    return this.jobsByIdempotencyKey.get(`${params.tenantId}:${params.workspaceId}:${params.idempotencyKey}`) ?? null;
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
    const useCase = new GetScanStatusUseCase(jobs);

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
      },
    });
  });

  it('returns not found for a missing scan job in tenant scope', async () => {
    const useCase = new GetScanStatusUseCase(new FakeScanJobs());

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      scanJobId: 'missing',
    });

    expect(result.ok).toBe(false);
  });
});
