import type { MetricsRecorderPort } from '@social-monitor/platform-metrics';
import type { QueueCommandEnvelope } from '@social-monitor/platform-queue';
import type { WorkerRuntime } from '@social-monitor/platform-worker';
import {
  DomainError,
  tenantId,
  workspaceId,
} from '@social-monitor/shared-kernel';

import type { ScheduleDueScansResult } from '../../features/schedule-due-scans/schedule-due-scans.result';
import type { ScheduleDueScansUseCase } from '../../features/schedule-due-scans/schedule-due-scans.use-case';

type ScheduleDueScansQueuePayload = {
  readonly tenantId?: string;
  readonly workspaceId?: string;
  readonly limit?: number;
  readonly includeDecisions?: boolean;
};

export type ScheduleDueScansQueueCommand =
  QueueCommandEnvelope<ScheduleDueScansQueuePayload>;

export class ScheduleDueScansCommandHandler {
  constructor(
    private readonly scheduleDueScans: ScheduleDueScansUseCase,
    private readonly metrics: MetricsRecorderPort,
    private readonly runtime: WorkerRuntime,
  ) {}

  async handle(
    command: QueueCommandEnvelope<Readonly<Record<string, unknown>>>,
  ): Promise<ScheduleDueScansResult> {
    if (command.commandType !== 'monitoring.scans.schedule_due') {
      throw new Error(`Unsupported command type: ${command.commandType}`);
    }

    return this.runtime.runIfAccepting(command.commandType, async () => {
      const payload = parsePayload(command.payload);
      this.recordRunMetric('started');
      let failureRecorded = false;

      try {
        const result = await this.scheduleDueScans.execute({
          tenantId:
            payload.tenantId === undefined
              ? undefined
              : tenantId(payload.tenantId),
          workspaceId:
            payload.workspaceId === undefined
              ? undefined
              : workspaceId(payload.workspaceId),
          limit: payload.limit ?? 50,
          correlationId: command.correlationId,
          includeDecisions: payload.includeDecisions,
        });

        if (!result.ok) {
          this.recordRunMetric('failed');
          this.recordFailureClassMetric(result.error);
          failureRecorded = true;
          throw result.error;
        }

        this.metrics.recordGauge({
          name: 'monitoring_scan_scheduler_last_evaluated',
          value: result.value.evaluated,
          labels: { worker: 'ingestion-worker' },
        });
        this.metrics.recordGauge({
          name: 'monitoring_scan_scheduler_last_enqueued',
          value: result.value.enqueued,
          labels: { worker: 'ingestion-worker' },
        });
        this.metrics.recordGauge({
          name: 'monitoring_scan_scheduler_last_skipped',
          value: result.value.skipped,
          labels: { worker: 'ingestion-worker' },
        });
        for (const [reason, value] of Object.entries(
          result.value.skippedByReason,
        )) {
          this.metrics.recordGauge({
            name: 'monitoring_scan_scheduler_last_skipped_by_reason',
            value,
            labels: {
              reason,
              worker: 'ingestion-worker',
            },
          });
        }
        this.recordRunMetric('succeeded');
        return result.value;
      } catch (error) {
        if (!failureRecorded) {
          this.recordRunMetric('failed');
          this.recordFailureClassMetric(error);
        }
        throw error;
      }
    });
  }

  private recordRunMetric(status: 'started' | 'succeeded' | 'failed'): void {
    this.metrics.incrementCounter({
      name: 'monitoring_scan_scheduler_runs_total',
      labels: {
        status,
        worker: 'ingestion-worker',
      },
    });
  }

  private recordFailureClassMetric(error: unknown): void {
    this.metrics.incrementCounter({
      name: 'monitoring_scan_scheduler_failures_total',
      labels: {
        failure_class: classifyFailure(error),
        worker: 'ingestion-worker',
      },
    });
  }
}

const classifyFailure = (
  error: unknown,
): 'validation_failed' | 'worker_conflict' | 'system_failure' => {
  if (error instanceof DomainError) {
    if (
      error.code === 'validation.failed' ||
      error.code === 'tenant.scope_missing'
    ) {
      return 'validation_failed';
    }

    if (
      error.code === 'operation.conflict' ||
      error.code === 'operation.backpressure'
    ) {
      return 'worker_conflict';
    }
  }

  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error).toLowerCase();

  if (message.includes('validation') || message.includes('invalid')) {
    return 'validation_failed';
  }

  if (message.includes('conflict') || message.includes('backpressure')) {
    return 'worker_conflict';
  }

  return 'system_failure';
};

const parsePayload = (
  payload: Readonly<Record<string, unknown>>,
): ScheduleDueScansQueuePayload => {
  const tenant = readOptionalString(payload, 'tenantId');
  const workspace = readOptionalString(payload, 'workspaceId');

  if ((tenant === undefined) !== (workspace === undefined)) {
    throw new DomainError(
      'tenant.scope_missing',
      'tenantId and workspaceId command payload fields must be provided together',
    );
  }

  return {
    tenantId: tenant,
    workspaceId: workspace,
    limit: readOptionalPositiveInteger(payload, 'limit'),
    includeDecisions: readOptionalBoolean(payload, 'includeDecisions'),
  };
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
    throw new Error(
      `Invalid schedule due scans command payload field: ${field}`,
    );
  }

  return value.trim();
};

const readOptionalPositiveInteger = (
  payload: Readonly<Record<string, unknown>>,
  field: string,
): number | undefined => {
  const value = payload[field];

  if (value === undefined) {
    return undefined;
  }

  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 100
  ) {
    throw new Error(
      `Invalid schedule due scans command payload field: ${field}`,
    );
  }

  return value;
};

const readOptionalBoolean = (
  payload: Readonly<Record<string, unknown>>,
  field: string,
): boolean | undefined => {
  const value = payload[field];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'boolean') {
    throw new Error(
      `Invalid schedule due scans command payload field: ${field}`,
    );
  }

  return value;
};
