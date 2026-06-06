import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { ScanJobRepositoryPort } from '../../ports';
import type { RecordScanExecutionCommand } from './record-scan-execution.command';
import type { RecordScanExecutionResult } from './record-scan-execution.result';

type RecordScanExecutionFailure = DomainError | Error;

export class RecordScanExecutionUseCase {
  constructor(private readonly scanJobs: ScanJobRepositoryPort) {}

  async execute(
    command: RecordScanExecutionCommand,
  ): Promise<Result<RecordScanExecutionResult, RecordScanExecutionFailure>> {
    const job = await this.scanJobs.findById({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      scanJobId: command.scanJobId,
    });

    if (job === null) {
      return err(new DomainError('resource.not_found', 'Scan job not found', { scanJobId: command.scanJobId }));
    }

    const updated =
      command.status === 'succeeded'
        ? job.markSucceeded({ completedAt: command.completedAt })
        : job.markFailed({
            completedAt: command.completedAt,
            failureReason: command.failureReason,
          });
    await this.scanJobs.save(updated);
    const snapshot = updated.toSnapshot();

    return ok({
      scanJobId: snapshot.id,
      status: snapshot.status,
    });
  }
}
