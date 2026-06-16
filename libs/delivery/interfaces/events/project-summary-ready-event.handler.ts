import type { MetricsRecorderPort } from '@social-monitor/platform-metrics';
import type { WorkerRuntime } from '@social-monitor/platform-worker';
import {
  causationId,
  correlationId,
  DomainError,
  eventId,
  type EventEnvelope,
  tenantId,
  workspaceId,
} from '@social-monitor/shared-kernel';

import type {
  ProjectSummaryReadyEventResult,
  ProjectSummaryReadyEventUseCase,
} from '../../features/project-summary-ready-event/project-summary-ready-event.use-case';
import type { SummaryReadyProjectionPayload } from '../../features/project-summary-ready-event/project-summary-ready-event.command';

export class ProjectSummaryReadyEventHandler {
  constructor(
    private readonly projectSummaryReady: ProjectSummaryReadyEventUseCase,
    private readonly metrics: MetricsRecorderPort,
    private readonly runtime: WorkerRuntime,
  ) {}

  async handle(event: Readonly<Record<string, unknown>>): Promise<ProjectSummaryReadyEventResult> {
    const eventType = readString(event, 'eventType');

    if (eventType !== 'summary.ready') {
      throw new Error(`Unsupported event type: ${eventType}`);
    }

    return this.runtime.runIfAccepting(eventType, async () => {
      const parsed = parseEvent(event);
      this.recordMetric('started');
      let failureRecorded = false;

      try {
        const result = await this.projectSummaryReady.execute({ event: parsed });

        if (!result.ok) {
          this.recordMetric('failed');
          this.recordFailureClassMetric(result.error);
          failureRecorded = true;
          throw result.error;
        }

        this.recordMetric('succeeded');
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
      name: 'delivery_realtime_projection_events_total',
      labels: {
        projection: 'summary_ready',
        status,
        worker: 'delivery-service',
      },
    });
  }

  private recordFailureClassMetric(error: unknown): void {
    this.metrics.incrementCounter({
      name: 'delivery_realtime_projection_failures_total',
      labels: {
        failure_class: classifyFailure(error),
        projection: 'summary_ready',
        worker: 'delivery-service',
      },
    });
  }
}

const parseEvent = (
  event: Readonly<Record<string, unknown>>,
): EventEnvelope<SummaryReadyProjectionPayload> => {
  const topLevelTenantId = tenantId(readString(event, 'tenantId'));
  const topLevelWorkspaceId = workspaceId(readString(event, 'workspaceId'));
  const payload = readObject(event.payload, 'payload');
  const payloadTenantId = tenantId(readString(payload, 'tenantId'));
  const payloadWorkspaceId = workspaceId(readString(payload, 'workspaceId'));

  if (payloadTenantId !== topLevelTenantId || payloadWorkspaceId !== topLevelWorkspaceId) {
    throw new DomainError('validation.failed', 'summary.ready payload scope must match event scope');
  }

  return {
    eventId: eventId(readString(event, 'eventId')),
    eventType: 'summary.ready',
    schemaVersion: readPositiveInteger(event, 'schemaVersion'),
    occurredAt: readDate(event.occurredAt, 'occurredAt'),
    tenantId: topLevelTenantId,
    workspaceId: topLevelWorkspaceId,
    correlationId: correlationId(readString(event, 'correlationId')),
    causationId: causationId(readString(event, 'causationId')),
    payload: {
      summaryJobId: readString(payload, 'summaryJobId'),
      summaryId: readString(payload, 'summaryId'),
      tenantId: payloadTenantId,
      workspaceId: payloadWorkspaceId,
      topicId: readString(payload, 'topicId'),
      status: readSummaryReadyStatus(payload, 'status'),
    },
  };
};

const readObject = (value: unknown, field: string): Readonly<Record<string, unknown>> => {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`Invalid summary.ready event field: ${field}`);
  }

  return value as Readonly<Record<string, unknown>>;
};

const readString = (payload: Readonly<Record<string, unknown>>, field: string): string => {
  const value = payload[field];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid summary.ready event field: ${field}`);
  }

  return value.trim();
};

const readDate = (value: unknown, field: string): Date => {
  const date = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null;

  if (date === null || Number.isNaN(date.getTime())) {
    throw new Error(`Invalid summary.ready event field: ${field}`);
  }

  return date;
};

const readPositiveInteger = (payload: Readonly<Record<string, unknown>>, field: string): number => {
  const value = payload[field];

  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error(`Invalid summary.ready event field: ${field}`);
  }

  return value;
};

const readSummaryReadyStatus = (
  payload: Readonly<Record<string, unknown>>,
  field: string,
): SummaryReadyProjectionPayload['status'] => {
  const value = readString(payload, field);

  if (value !== 'completed' && value !== 'no_signal') {
    throw new Error(`Invalid summary.ready event field: ${field}`);
  }

  return value;
};

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

  if (message.includes('invalid') || message.includes('validation') || message.includes('scope')) {
    return 'validation_failed';
  }

  if (message.includes('conflict') || message.includes('running') || message.includes('backpressure')) {
    return 'worker_conflict';
  }

  return 'system_failure';
};
