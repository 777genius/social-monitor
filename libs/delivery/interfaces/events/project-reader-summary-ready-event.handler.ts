import type { MetricsRecorderPort } from '@social-monitor/platform-metrics';
import { runWithTenantDatabaseAccess } from '@social-monitor/platform-persistence';
import type { WorkerRuntime } from '@social-monitor/platform-worker';
import { DomainError } from '@social-monitor/shared-kernel';
import type { ProjectReaderSummaryReadyEventUseCase, ProjectReaderSummaryReadyResult } from '../../features/project-reader-summary-ready-event/project-reader-summary-ready-event.use-case';
import { parseReaderSummaryReadyEvent } from './reader-summary-ready-event.parser';

export class ProjectReaderSummaryReadyEventHandler {
  constructor(
    private readonly project: ProjectReaderSummaryReadyEventUseCase,
    private readonly metrics: MetricsRecorderPort,
    private readonly runtime: WorkerRuntime,
  ) {}

  async handle(input: Readonly<Record<string, unknown>>): Promise<ProjectReaderSummaryReadyResult> {
    return this.runtime.runIfAccepting('reader_summary.ready', async () => {
      try {
        const event = parseReaderSummaryReadyEvent(input);
        const result = await runWithTenantDatabaseAccess(event.payload, () => this.project.execute({ event }));
        if (!result.ok) throw result.error;
        this.record(result.value.duplicate ? 'duplicate' : 'succeeded');
        return result.value;
      } catch (error) {
        this.record(error instanceof DomainError && error.code === 'validation.failed' ? 'validation_failed' : 'failed');
        throw error;
      }
    });
  }
  private record(status: string): void {
    this.metrics.incrementCounter({ name: 'delivery_realtime_projection_events_total',
      labels: { projection: 'reader_summary_ready', status, worker: 'delivery-service' } });
  }
}
