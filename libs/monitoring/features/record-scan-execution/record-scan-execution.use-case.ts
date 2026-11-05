import {
  DomainError,
  err,
  ok,
  type Result,
} from '@social-monitor/shared-kernel';

import type { ScanJobRepositoryPort, ScanJobOutcomeRepositoryPort } from '../../ports';
import type { RecordScanExecutionCommand } from './record-scan-execution.command';
import type { RecordScanExecutionResult } from './record-scan-execution.result';

type RecordScanExecutionFailure = DomainError | Error;

export class RecordScanExecutionUseCase {
  constructor(private readonly scanJobs: Pick<ScanJobRepositoryPort, 'findById'> & ScanJobOutcomeRepositoryPort) {}

  async execute(
    command: RecordScanExecutionCommand,
  ): Promise<Result<RecordScanExecutionResult, RecordScanExecutionFailure>> {
    const job = await this.scanJobs.findById({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      scanJobId: command.scanJobId,
    });

    if (job === null) {
      return err(
        new DomainError('resource.not_found', 'Scan job not found', {
          scanJobId: command.scanJobId,
        }),
      );
    }

    const current = job.toSnapshot();
    if (current.status === command.status) {
      return ok({ scanJobId: current.id, status: current.status });
    }
    if (current.status !== 'enqueued') {
      return err(new DomainError('operation.conflict', 'Scan job cannot accept this terminal outcome', {
        scanJobId: command.scanJobId,
        status: current.status,
        reportedStatus: command.status,
      }));
    }

    const updated =
      command.status === 'succeeded'
        ? job.markSucceeded({
            completedAt: command.completedAt,
            executionMetadata: command.executionMetadata,
          })
        : job.markFailed({
            completedAt: command.completedAt,
            failureReason: command.failureReason,
            failureMetadata: command.failureMetadata,
            executionMetadata: command.executionMetadata,
          });
    if (!(await this.scanJobs.saveTerminalOutcome(updated))) {
      const latest = await this.scanJobs.findById({
        tenantId: command.tenantId, workspaceId: command.workspaceId, scanJobId: command.scanJobId,
      });
      if (latest?.toSnapshot().status !== command.status) {
        return err(new DomainError('operation.conflict', 'Scan terminal outcome was already decided', {
          scanJobId: command.scanJobId, reportedStatus: command.status,
        }));
      }
      return ok({ scanJobId: command.scanJobId, status: command.status });
    }
    const snapshot = updated.toSnapshot();

    return ok({
      scanJobId: snapshot.id,
      status: snapshot.status,
    });
  }
}
