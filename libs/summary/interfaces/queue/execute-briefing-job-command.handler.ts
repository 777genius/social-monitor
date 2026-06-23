import type { MetricsRecorderPort } from '@social-monitor/platform-metrics';
import type { QueueCommandEnvelope } from '@social-monitor/platform-queue';
import type { WorkerRuntime } from '@social-monitor/platform-worker';
import { DomainError, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { ExecuteBriefingJobUseCase } from '../../features/execute-briefing-job/execute-briefing-job.use-case';
import type { ExecuteBriefingJobResult } from '../../features/execute-briefing-job/execute-briefing-job.result';

type ExecuteBriefingJobQueuePayload = {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly briefingJobId: string;
  readonly maxEvidenceItems?: number;
};

export type ExecuteBriefingJobQueueCommand = QueueCommandEnvelope<ExecuteBriefingJobQueuePayload>;

export class ExecuteBriefingJobCommandHandler {
  constructor(
    private readonly executeBriefingJob: ExecuteBriefingJobUseCase,
    private readonly metrics: MetricsRecorderPort,
    private readonly runtime: WorkerRuntime,
  ) {}

  async handle(command: QueueCommandEnvelope<Readonly<Record<string, unknown>>>): Promise<ExecuteBriefingJobResult> {
    if (command.commandType !== 'briefing.job.execute') {
      throw new Error(`Unsupported command type: ${command.commandType}`);
    }

    return this.runtime.runIfAccepting(command.commandType, async () => {
      const payload = parsePayload(command.payload);
      this.recordMetric('started');
      let failureRecorded = false;

      try {
        const result = await this.executeBriefingJob.execute({
          tenantId: tenantId(payload.tenantId),
          workspaceId: workspaceId(payload.workspaceId),
          briefingJobId: payload.briefingJobId,
          maxEvidenceItems: payload.maxEvidenceItems,
        });

        if (!result.ok) {
          this.recordMetric('failed');
          this.recordFailureClassMetric(result.error);
          failureRecorded = true;
          throw result.error;
        }

        this.recordMetric(result.value.status === 'failed' ? 'failed' : 'succeeded');
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
      name: 'summary_jobs_total',
      labels: {
        job_type: 'briefing',
        status,
        worker: 'intelligence-worker',
      },
    });
  }

  private recordFailureClassMetric(error: unknown): void {
    this.metrics.incrementCounter({
      name: 'summary_job_failures_total',
      labels: {
        failure_class: classifyFailure(error),
        job_type: 'briefing',
        worker: 'intelligence-worker',
      },
    });
  }
}

const classifyFailure = (
  error: unknown,
): 'budget_exceeded' | 'citation_validation_failed' | 'worker_conflict' | 'system_failure' => {
  if (error instanceof DomainError) {
    const kind = error.details.kind;

    if (kind === 'budget_exceeded') {
      return 'budget_exceeded';
    }

    if (kind === 'citation_validation_failed') {
      return 'citation_validation_failed';
    }

    if (error.code === 'operation.conflict' || error.code === 'operation.backpressure') {
      return 'worker_conflict';
    }
  }

  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  if (message.includes('budget')) {
    return 'budget_exceeded';
  }

  if (message.includes('citation')) {
    return 'citation_validation_failed';
  }

  if (message.includes('conflict') || message.includes('running') || message.includes('backpressure')) {
    return 'worker_conflict';
  }

  return 'system_failure';
};

const parsePayload = (payload: Readonly<Record<string, unknown>>): ExecuteBriefingJobQueuePayload => ({
  tenantId: readTenantScopeString(payload, 'tenantId'),
  workspaceId: readTenantScopeString(payload, 'workspaceId'),
  briefingJobId: readString(payload, 'briefingJobId'),
  maxEvidenceItems: readOptionalPositiveInteger(payload, 'maxEvidenceItems'),
});

const readString = (payload: Readonly<Record<string, unknown>>, field: string): string => {
  const value = payload[field];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid execute briefing job command payload field: ${field}`);
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

const readOptionalPositiveInteger = (
  payload: Readonly<Record<string, unknown>>,
  field: string,
): number | undefined => {
  const value = payload[field];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error(`Invalid execute briefing job command payload field: ${field}`);
  }

  return value;
};
