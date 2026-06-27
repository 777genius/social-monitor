import { NestFactory } from '@nestjs/core';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { ExecuteSummaryJobCommandHandler } from '@social-monitor/summary/interfaces/queue/execute-summary-job-command.handler';
import {
  SUMMARY_JOB_REPOSITORY,
} from '@social-monitor/summary/interfaces/rest/summary-provider-tokens';
import type { SummaryJobRepositoryPort } from '@social-monitor/summary/ports';
import { SummaryJob } from '@social-monitor/summary/domain';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import 'reflect-metadata';

import { IntelligenceWorkerModule } from '../apps/intelligence-worker/src/intelligence-worker.module';
import { INTELLIGENCE_WORKER_METRICS_RECORDER } from '../apps/intelligence-worker/src/intelligence-worker-provider-tokens';

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(IntelligenceWorkerModule, { logger: false });

  try {
    const tenant = tenantId('tenant-summary-worker-smoke');
    const workspace = workspaceId('workspace-summary-worker-smoke');
    const summaryJobId = 'summary-job-worker-smoke';
    const summaryJobs = app.get<SummaryJobRepositoryPort>(SUMMARY_JOB_REPOSITORY);
    await summaryJobs.save(SummaryJob.request({
      id: summaryJobId,
      tenantId: tenant,
      workspaceId: workspace,
      topicId: 'topic-worker-smoke',
      idempotencyKey: 'summary-worker-smoke:topic-worker-smoke',
      requestedAt: new Date('2026-06-06T00:00:00.000Z'),
    }));

    const result = await app.get(ExecuteSummaryJobCommandHandler).handle({
      commandId: 'command-summary-worker-smoke',
      commandType: 'summary.job.execute',
      schemaVersion: 1,
      correlationId: 'correlation-summary-worker-smoke',
      payload: {
        tenantId: tenant,
        workspaceId: workspace,
        summaryJobId,
        maxEvidenceItems: 5,
      },
    });

    assert(result.summaryJobId === summaryJobId, 'summary worker command must preserve job id');
    assert(result.status === 'no_signal', 'summary worker command must complete no-signal jobs without evidence');
    assert(typeof result.summaryId === 'string', 'summary worker command must persist a summary artifact id');

    const metrics = app.get<InMemoryMetricsRecorder>(
      INTELLIGENCE_WORKER_METRICS_RECORDER,
    );
    assert(
      metrics.counterValue('summary_jobs_total', {
        job_type: 'summary',
        status: 'started',
        worker: 'intelligence-worker',
      }) === 1,
      'summary worker command must record started metric',
    );
    assert(
      metrics.counterValue('summary_jobs_total', {
        job_type: 'summary',
        status: 'succeeded',
        worker: 'intelligence-worker',
      }) === 1,
      'summary worker command must record succeeded metric',
    );

    await app.get(ExecuteSummaryJobCommandHandler).handle({
      commandId: 'command-summary-worker-missing-scope',
      commandType: 'summary.job.execute',
      schemaVersion: 1,
      correlationId: 'correlation-summary-worker-smoke',
      payload: {
        workspaceId: workspace,
        summaryJobId,
      },
    }).then(
      () => {
        throw new Error('summary worker command must reject missing tenant scope');
      },
      (error: unknown) => {
        assert(
          typeof error === 'object' && error !== null && 'code' in error && error.code === 'tenant.scope_missing',
          'summary worker command must return controlled tenant.scope_missing',
        );
      },
    );

    console.log('Summary worker command smoke OK');
  } finally {
    await app.close();
  }
}

void main();
