import type { ScanExecutionReporterPort } from '@social-monitor/ingestion/ports';

import type { RecordScanExecutionUseCase } from '../../features/record-scan-execution/record-scan-execution.use-case';

export class MonitoringScanExecutionReporterAdapter implements ScanExecutionReporterPort {
  constructor(
    private readonly recordScanExecution: RecordScanExecutionUseCase,
  ) {}

  async reportSucceeded(
    command: Parameters<ScanExecutionReporterPort['reportSucceeded']>[0],
  ): Promise<void> {
    const result = await this.recordScanExecution.execute({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      scanJobId: command.scanJobId,
      completedAt: command.completedAt,
      status: 'succeeded',
      executionMetadata: command.collectionTelemetry,
    });

    if (!result.ok) {
      throw result.error;
    }
  }

  async reportFailed(
    command: Parameters<ScanExecutionReporterPort['reportFailed']>[0],
  ): Promise<void> {
    const result = await this.recordScanExecution.execute({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      scanJobId: command.scanJobId,
      completedAt: command.completedAt,
      status: 'failed',
      failureReason: command.failureReason,
      failureMetadata: command.failureMetadata,
      executionMetadata: command.collectionTelemetry,
    });

    if (!result.ok) {
      throw result.error;
    }
  }
}
