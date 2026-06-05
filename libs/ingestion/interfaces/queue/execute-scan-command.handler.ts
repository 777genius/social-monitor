import type { QueueCommandEnvelope } from '@social-monitor/platform-queue';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { ExecuteScanUseCase } from '../../features/execute-scan/execute-scan.use-case';
import type { ExecuteScanResult } from '../../features/execute-scan/execute-scan.result';

type ExecuteScanQueuePayload = {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly scanJobId: string;
  readonly sourceBindingId: string;
  readonly scanPolicyId: string;
};

export type ExecuteScanQueueCommand = QueueCommandEnvelope<ExecuteScanQueuePayload>;

export class ExecuteScanCommandHandler {
  constructor(private readonly executeScan: ExecuteScanUseCase) {}

  async handle(command: ExecuteScanQueueCommand): Promise<ExecuteScanResult> {
    if (command.commandType !== 'ingestion.scan.execute') {
      throw new Error(`Unsupported command type: ${command.commandType}`);
    }

    const result = await this.executeScan.execute({
      tenantId: tenantId(command.payload.tenantId),
      workspaceId: workspaceId(command.payload.workspaceId),
      scanJobId: command.payload.scanJobId,
      sourceBindingId: command.payload.sourceBindingId,
      scanPolicyId: command.payload.scanPolicyId,
      correlationId: command.correlationId,
      causationId: command.causationId ?? command.commandId,
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }
}
