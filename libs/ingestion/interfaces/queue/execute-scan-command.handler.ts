import type { QueueCommandEnvelope } from '@social-monitor/platform-queue';
import { DomainError, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { ExecuteScanUseCase } from '../../features/execute-scan/execute-scan.use-case';
import type { ExecuteScanResult } from '../../features/execute-scan/execute-scan.result';

type ExecuteScanQueuePayload = {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly scanJobId: string;
  readonly sourceBindingId: string;
  readonly scanPolicyId: string;
  readonly attemptNumber?: number;
  readonly retryBudget?: number;
  readonly workerId?: string;
  readonly leaseTtlSeconds?: number;
};

export type ExecuteScanQueueCommand = QueueCommandEnvelope<ExecuteScanQueuePayload>;

export class ExecuteScanCommandHandler {
  constructor(private readonly executeScan: ExecuteScanUseCase) {}

  async handle(command: QueueCommandEnvelope<Readonly<Record<string, unknown>>>): Promise<ExecuteScanResult> {
    if (command.commandType !== 'ingestion.scan.execute') {
      throw new Error(`Unsupported command type: ${command.commandType}`);
    }

    const payload = parsePayload(command.payload);
    const result = await this.executeScan.execute({
      tenantId: tenantId(payload.tenantId),
      workspaceId: workspaceId(payload.workspaceId),
      scanJobId: payload.scanJobId,
      sourceBindingId: payload.sourceBindingId,
      scanPolicyId: payload.scanPolicyId,
      correlationId: command.correlationId,
      causationId: command.causationId ?? command.commandId,
      attemptNumber: payload.attemptNumber,
      retryBudget: payload.retryBudget,
      workerId: payload.workerId,
      leaseTtlSeconds: payload.leaseTtlSeconds,
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }
}

const parsePayload = (payload: Readonly<Record<string, unknown>>): ExecuteScanQueuePayload => ({
  tenantId: readTenantScopeString(payload, 'tenantId'),
  workspaceId: readTenantScopeString(payload, 'workspaceId'),
  scanJobId: readString(payload, 'scanJobId'),
  sourceBindingId: readString(payload, 'sourceBindingId'),
  scanPolicyId: readString(payload, 'scanPolicyId'),
  attemptNumber: readOptionalPositiveInteger(payload, 'attemptNumber'),
  retryBudget: readOptionalPositiveInteger(payload, 'retryBudget'),
  workerId: readOptionalString(payload, 'workerId'),
  leaseTtlSeconds: readOptionalPositiveInteger(payload, 'leaseTtlSeconds'),
});

const readString = (payload: Readonly<Record<string, unknown>>, field: string): string => {
  const value = payload[field];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid execute scan command payload field: ${field}`);
  }

  return value;
};

const readTenantScopeString = (payload: Readonly<Record<string, unknown>>, field: string): string => {
  const value = payload[field];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new DomainError('tenant.scope_missing', `${field} command payload field is required`);
  }

  return value;
};

const readOptionalString = (
  payload: Readonly<Record<string, unknown>>,
  field: string,
): string | undefined => {
  const value = payload[field];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid execute scan command payload field: ${field}`);
  }

  return value;
};

const readOptionalPositiveInteger = (
  payload: Readonly<Record<string, unknown>>,
  field: string,
): number | undefined => {
  const value = payload[field];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error(`Invalid execute scan command payload field: ${field}`);
  }

  return value;
};
