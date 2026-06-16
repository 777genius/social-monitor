import type { MetricsRecorderPort } from '@social-monitor/platform-metrics';
import type { QueueCommandEnvelope } from '@social-monitor/platform-queue';
import type { WorkerRuntime } from '@social-monitor/platform-worker';
import { DomainError, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { SendDeliveryAttemptUseCase } from '../../features/send-delivery-attempt/send-delivery-attempt.use-case';
import type { SendDeliveryAttemptResult } from '../../features/send-delivery-attempt/send-delivery-attempt.result';
import type { DeliveryContent } from '../../ports';

type SendDeliveryAttemptQueuePayload = {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly deliveryAttemptId: string;
  readonly content: DeliveryContent;
};

export type SendDeliveryAttemptQueueCommand = QueueCommandEnvelope<SendDeliveryAttemptQueuePayload>;

export class SendDeliveryAttemptCommandHandler {
  constructor(
    private readonly sendDeliveryAttempt: SendDeliveryAttemptUseCase,
    private readonly metrics: MetricsRecorderPort,
    private readonly runtime: WorkerRuntime,
  ) {}

  async handle(command: QueueCommandEnvelope<Readonly<Record<string, unknown>>>): Promise<SendDeliveryAttemptResult> {
    if (command.commandType !== 'delivery.attempt.send') {
      throw new Error(`Unsupported command type: ${command.commandType}`);
    }

    return this.runtime.runIfAccepting(command.commandType, async () => {
      const payload = parsePayload(command.payload);
      this.recordMetric('started');
      let failureRecorded = false;

      try {
        const result = await this.sendDeliveryAttempt.execute({
          tenantId: tenantId(payload.tenantId),
          workspaceId: workspaceId(payload.workspaceId),
          deliveryAttemptId: payload.deliveryAttemptId,
          content: payload.content,
        });

        if (!result.ok) {
          this.recordMetric('failed');
          this.recordFailureClassMetric(result.error);
          failureRecorded = true;
          throw result.error;
        }

        this.recordMetric(isFailedDeliveryState(result.value.attempt.state) ? 'failed' : 'succeeded');
        return result.value;
      } catch (error) {
        if (!failureRecorded) {
          this.recordMetric('failed');
          this.recordFailureClassMetric(error);
        }
        throw error;
      }
    });
  }

  private recordMetric(status: 'started' | 'succeeded' | 'failed'): void {
    this.metrics.incrementCounter({
      name: 'delivery_attempt_dispatch_total',
      labels: {
        status,
        worker: 'delivery-service',
      },
    });
  }

  private recordFailureClassMetric(error: unknown): void {
    this.metrics.incrementCounter({
      name: 'delivery_attempt_dispatch_failures_total',
      labels: {
        failure_class: classifyFailure(error),
        worker: 'delivery-service',
      },
    });
  }
}

const parsePayload = (payload: Readonly<Record<string, unknown>>): SendDeliveryAttemptQueuePayload => ({
  tenantId: readTenantScopeString(payload, 'tenantId'),
  workspaceId: readTenantScopeString(payload, 'workspaceId'),
  deliveryAttemptId: readString(payload, 'deliveryAttemptId'),
  content: readContent(payload.content),
});

const readContent = (value: unknown): DeliveryContent => {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Invalid send delivery attempt command payload field: content');
  }

  const content = value as Readonly<Record<string, unknown>>;

  return {
    subject: readOptionalString(content, 'subject'),
    body: readString(content, 'body'),
  };
};

const readString = (payload: Readonly<Record<string, unknown>>, field: string): string => {
  const value = payload[field];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid send delivery attempt command payload field: ${field}`);
  }

  return value.trim();
};

const readOptionalString = (payload: Readonly<Record<string, unknown>>, field: string): string | undefined => {
  const value = payload[field];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid send delivery attempt command payload field: ${field}`);
  }

  return value.trim();
};

const readTenantScopeString = (payload: Readonly<Record<string, unknown>>, field: string): string => {
  const value = payload[field];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new DomainError('tenant.scope_missing', `${field} command payload field is required`);
  }

  return value.trim();
};

const classifyFailure = (error: unknown): 'tenant_scope_missing' | 'provider_failure' | 'worker_conflict' | 'system_failure' => {
  if (error instanceof DomainError) {
    if (error.code === 'tenant.scope_missing') {
      return 'tenant_scope_missing';
    }

    if (error.code === 'operation.conflict' || error.code === 'operation.backpressure') {
      return 'worker_conflict';
    }

    if (error.code === 'external.dependency_unavailable') {
      return 'provider_failure';
    }
  }

  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  if (message.includes('provider') || message.includes('delivery')) {
    return 'provider_failure';
  }

  if (message.includes('conflict') || message.includes('running') || message.includes('backpressure')) {
    return 'worker_conflict';
  }

  return 'system_failure';
};

const isFailedDeliveryState = (state: SendDeliveryAttemptResult['attempt']['state']): boolean =>
  state === 'failed_retryable' || state === 'failed_terminal' || state === 'dead_lettered';
