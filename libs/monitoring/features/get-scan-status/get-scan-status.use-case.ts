import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { ScanJobRepositoryPort } from '../../ports';
import type { GetScanStatusQuery } from './get-scan-status.query';
import type { GetScanStatusResult } from './get-scan-status.result';

type GetScanStatusFailure = DomainError;

export class GetScanStatusUseCase {
  constructor(private readonly scanJobs: ScanJobRepositoryPort) {}

  async execute(query: GetScanStatusQuery): Promise<Result<GetScanStatusResult, GetScanStatusFailure>> {
    const job = await this.scanJobs.findById({
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
      scanJobId: query.scanJobId,
    });

    if (job === null) {
      return err(new DomainError('resource.not_found', 'Scan job not found', { scanJobId: query.scanJobId }));
    }

    const snapshot = job.toSnapshot();

    return ok({
      scanJobId: snapshot.id,
      sourceBindingId: snapshot.sourceBindingId,
      scanPolicyId: snapshot.scanPolicyId,
      status: snapshot.status,
      requestedAt: snapshot.requestedAt,
      enqueuedAt: snapshot.enqueuedAt,
      completedAt: snapshot.completedAt,
      failureReason: snapshot.failureReason,
    });
  }
}
