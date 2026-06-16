import { InMemoryFeedItemReadRepository } from '@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { WorkerRuntime } from '@social-monitor/platform-worker';
import { FeedSummaryEvidenceSelector } from '@social-monitor/summary/adapters/evidence/feed-summary-evidence.selector';
import { InMemorySummaryEventPublisher } from '@social-monitor/summary/adapters/messaging/in-memory-summary-event-publisher';
import { DeterministicSummaryModelAdapter } from '@social-monitor/summary/adapters/model/deterministic-summary-model.adapter';
import { InMemorySummaryArtifactRepository } from '@social-monitor/summary/adapters/persistence/in-memory-summary-artifact.repository';
import { InMemorySummaryJobRepository } from '@social-monitor/summary/adapters/persistence/in-memory-summary-job.repository';
import { InMemorySummaryPolicyRepository } from '@social-monitor/summary/adapters/persistence/in-memory-summary-policy.repository';
import { SummaryJob } from '@social-monitor/summary/domain';
import { ExecuteSummaryJobUseCase } from '@social-monitor/summary/features/execute-summary-job/execute-summary-job.use-case';
import { ExecuteSummaryJobCommandHandler } from '@social-monitor/summary/interfaces/queue/execute-summary-job-command.handler';
import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { SummaryJobPollingLoop } from '../apps/intelligence-worker/src/summary-job-polling-loop';

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `summary-job-polling-loop-smoke-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

async function main(): Promise<void> {
  const tenant = tenantId('tenant-summary-polling-loop-smoke');
  const workspace = workspaceId('workspace-summary-polling-loop-smoke');
  const summaryJobId = 'summary-job-polling-loop-smoke';
  const summaryJobs = new InMemorySummaryJobRepository();
  const summaryArtifacts = new InMemorySummaryArtifactRepository();
  const summaryPolicies = new InMemorySummaryPolicyRepository();
  const events = new InMemorySummaryEventPublisher();
  const metrics = new InMemoryMetricsRecorder();
  const runtime = new WorkerRuntime({ serviceName: 'intelligence-worker' });
  runtime.onModuleInit();

  await summaryJobs.save(SummaryJob.request({
    id: summaryJobId,
    tenantId: tenant,
    workspaceId: workspace,
    topicId: 'topic-summary-polling-loop-smoke',
    idempotencyKey: 'summary-polling-loop-smoke:topic-summary-polling-loop-smoke',
    requestedAt: new Date('2026-06-06T00:00:00.000Z'),
  }));

  const loop = new SummaryJobPollingLoop(
    new ExecuteSummaryJobCommandHandler(
      new ExecuteSummaryJobUseCase(
        summaryJobs,
        summaryArtifacts,
        summaryPolicies,
        new FeedSummaryEvidenceSelector(new InMemoryFeedItemReadRepository()),
        new DeterministicSummaryModelAdapter(),
        events,
        new SequenceIdGenerator(),
        new FixedClock(new Date('2026-06-06T00:01:00.000Z')),
      ),
      metrics,
      runtime,
    ),
    summaryJobs,
    {
      enabled: true,
      intervalMs: 60_000,
      limit: 10,
      runOnStart: true,
      tenantId: tenant,
      workspaceId: workspace,
    },
  );

  await loop.onModuleInit();
  await loop.onApplicationShutdown('summary-job-polling-loop-smoke-complete');
  await runtime.onApplicationShutdown('summary-job-polling-loop-smoke-complete');

  const job = await summaryJobs.findById({ tenantId: tenant, workspaceId: workspace, summaryJobId });
  const snapshot = job?.toSnapshot();
  assert(snapshot?.status === 'no_signal', `expected no_signal summary job, got ${snapshot?.status}`);
  assert(typeof snapshot.summaryId === 'string', 'polling loop must persist summary artifact id on the job');
  assert(events.all().length === 1, `polling loop must publish one summary.ready event, got ${events.all().length}`);
  assert(
    metrics.counterValue('summary_jobs_total', {
      job_type: 'summary',
      status: 'started',
      worker: 'intelligence-worker',
    }) === 1,
    'polling loop must record started summary metric',
  );
  assert(
    metrics.counterValue('summary_jobs_total', {
      job_type: 'summary',
      status: 'succeeded',
      worker: 'intelligence-worker',
    }) === 1,
    'polling loop must record succeeded summary metric',
  );

  const remaining = await summaryJobs.findRequested({ tenantId: tenant, workspaceId: workspace, limit: 10 });
  assert(remaining.length === 0, `polling loop must drain requested jobs, got ${remaining.length}`);

  console.log('Summary job polling loop smoke OK');
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
