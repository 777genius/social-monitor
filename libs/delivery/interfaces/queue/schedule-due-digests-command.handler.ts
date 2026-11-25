import type { MetricsRecorderPort } from '@social-monitor/platform-metrics';
import type { QueueCommandEnvelope } from '@social-monitor/platform-queue';
import type { WorkerRuntime } from '@social-monitor/platform-worker';
import { DomainError, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { ScheduleDueDigestsUseCase } from '../../features/schedule-due-digests/schedule-due-digests.use-case';
import type { ScheduleDueDigestsResult } from '../../features/schedule-due-digests/schedule-due-digests.result';

type ScheduleDueDigestsQueuePayload = {
  readonly tenantId?: string;
  readonly workspaceId?: string;
  readonly limit?: number;
};

export type ScheduleDueDigestsQueueCommand = QueueCommandEnvelope<ScheduleDueDigestsQueuePayload>;

export class ScheduleDueDigestsCommandHandler {
  constructor(
    private readonly scheduleDueDigests: ScheduleDueDigestsUseCase,
    private readonly metrics: MetricsRecorderPort,
    private readonly runtime: WorkerRuntime,
  ) {}

  async handle(command: QueueCommandEnvelope<Readonly<Record<string, unknown>>>): Promise<ScheduleDueDigestsResult> {
    if (command.commandType !== 'delivery.digests.schedule_due') {
      throw new Error(`Unsupported command type: ${command.commandType}`);
    }

    return this.runtime.runIfAccepting(command.commandType, async () => {
      const payload = parsePayload(command.payload);
      this.recordRunMetric('started');
      let failureRecorded = false;

      try {
        const result = await this.scheduleDueDigests.execute({
          tenantId: payload.tenantId === undefined ? undefined : tenantId(payload.tenantId),
          workspaceId: payload.workspaceId === undefined ? undefined : workspaceId(payload.workspaceId),
          limit: payload.limit ?? 20,
        });

        if (!result.ok) {
          this.recordRunMetric('failed');
          this.recordFailureClassMetric(result.error);
          failureRecorded = true;
          throw result.error;
        }

        this.metrics.recordGauge({
          name: 'delivery_digest_scheduler_last_evaluated',
          value: result.value.evaluated,
          labels: { worker: 'delivery-service' },
        });
        this.metrics.recordGauge({
          name: 'delivery_digest_scheduler_last_assembled',
          value: result.value.assembled,
          labels: { worker: 'delivery-service' },
        });
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
      name: 'delivery_digest_scheduler_runs_total',
      labels: {
        status,
        worker: 'delivery-service',
      },
    });
  }

  private recordFailureClassMetric(error: unknown): void {
    this.metrics.incrementCounter({
      name: 'delivery_digest_scheduler_failures_total',
      labels: {
        failure_class: classifyFailure(error),
        worker: 'delivery-service',
      },
    });
  }
}

const classifyFailure = (error: unknown): 'validation_failed' | 'worker_conflict' | 'system_failure' => {
  if (error instanceof DomainError) {
    if (error.code === 'validation.failed' || error.code === 'tenant.scope_missing') {
      return 'validation_failed';
    }

    if (error.code === 'operation.conflict' || error.code === 'operation.backpressure') {
      return 'worker_conflict';
    }
  }

  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  if (message.includes('validation') || message.includes('invalid')) {
    return 'validation_failed';
  }

  if (message.includes('conflict') || message.includes('backpressure')) {
    return 'worker_conflict';
  }

  return 'system_failure';
};

const parsePayload = (payload: Readonly<Record<string, unknown>>): ScheduleDueDigestsQueuePayload => {
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
    throw new Error(`Invalid schedule due digests command payload field: ${field}`);
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

  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error(`Invalid schedule due digests command payload field: ${field}`);
  }

  return value;
};
