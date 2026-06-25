import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { InMemoryQueuePublisher } from '@social-monitor/platform-queue/adapters/in-memory';
import { WorkerRuntime } from '@social-monitor/platform-worker';
import { BriefingJobQueuePublisherAdapter } from '@social-monitor/summary/adapters/messaging/in-memory-briefing-job-queue.adapter';
import { InMemorySummaryEventPublisher } from '@social-monitor/summary/adapters/messaging/in-memory-summary-event-publisher';
import { DeterministicBriefingModelAdapter } from '@social-monitor/summary/adapters/model/deterministic-briefing-model.adapter';
import { InMemoryBriefingArtifactRepository } from '@social-monitor/summary/adapters/persistence/in-memory-briefing-artifact.repository';
import { InMemoryBriefingJobRepository } from '@social-monitor/summary/adapters/persistence/in-memory-briefing-job.repository';
import { InMemoryBriefingPolicyRepository } from '@social-monitor/summary/adapters/persistence/in-memory-briefing-policy.repository';
import { ExecuteBriefingJobUseCase } from '@social-monitor/summary/features/execute-briefing-job/execute-briefing-job.use-case';
import { RequestBriefingUseCase } from '@social-monitor/summary/features/request-briefing/request-briefing.use-case';
import { ExecuteBriefingJobCommandHandler } from '@social-monitor/summary/interfaces/queue/execute-briefing-job-command.handler';
import { FixedClock, type IdGenerator, ok, tenantId, workspaceId } from '@social-monitor/shared-kernel';
import type { BriefingReaderItem } from '@social-monitor/summary/domain';
import type { BriefingEvidenceSelectorPort, SummaryQuotaPort } from '@social-monitor/summary/ports';

import { BriefingJobQueueDrainLoop } from '../apps/intelligence-worker/src/briefing-job-queue-drain-loop';
import { InMemorySummaryJobQueueReader } from '../apps/intelligence-worker/src/summary-job-queue-reader';

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `briefing-workflow-smoke-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

class SelectedBriefingEvidenceSelector implements BriefingEvidenceSelectorPort {
  async select(): ReturnType<BriefingEvidenceSelectorPort['select']> {
    return {
      rankingPolicyVersion: 'story_ranking_v1',
      sourceWindow: {
        windowId: 'workspace:briefing-workflow-smoke',
        startedAt: new Date('2026-06-23T08:00:00.000Z'),
        endedAt: new Date('2026-06-23T08:30:00.000Z'),
        selectedFeedItemIds: ['feed-reddit'],
        storyClusterIds: ['story:ai-tooling'],
      },
      clusters: [
        {
          id: 'story:ai-tooling',
          storyKey: 'url:example.com/ai-tooling',
          representativeFeedItemId: 'feed-reddit',
          duplicateFeedItemIds: ['feed-github'],
          topicIds: ['topic-ai', 'topic-github'],
          providerKeys: ['reddit', 'github'],
          score: 2.4,
          observedAtRange: {
            startedAt: new Date('2026-06-23T08:00:00.000Z'),
            endedAt: new Date('2026-06-23T08:30:00.000Z'),
          },
          whyImportant: ['Clustered 2 similar items'],
        },
      ],
      selectedEvidence: [
        {
          feedItemId: 'feed-reddit',
          sourceItemId: 'source-reddit',
          sourceBindingId: 'binding-reddit',
          topicId: 'topic-ai',
          providerKey: 'reddit',
          canonicalUrl: 'https://example.com/ai-tooling',
          title: 'AI tooling library is trending',
          bodyPreview: 'Developers are discussing a new AI tooling library.',
          publishedAt: new Date('2026-06-23T08:00:00.000Z'),
          observedAt: new Date('2026-06-23T08:01:00.000Z'),
          score: 2.4,
          whyImportant: ['Fresh item in the current monitoring window'],
        },
      ],
    };
  }
}

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

async function main(): Promise<void> {
  const tenant = tenantId('tenant-briefing-workflow-smoke');
  const workspace = workspaceId('workspace-briefing-workflow-smoke');
  const queue = new InMemoryQueuePublisher();
  const jobs = new InMemoryBriefingJobRepository();
  const artifacts = new InMemoryBriefingArtifactRepository();
  const policies = new InMemoryBriefingPolicyRepository();
  const events = new InMemorySummaryEventPublisher();
  const metrics = new InMemoryMetricsRecorder();
  const ids = new SequenceIdGenerator();
  const clock = new FixedClock(new Date('2026-06-23T08:31:00.000Z'));
  const runtime = new WorkerRuntime({ serviceName: 'intelligence-worker' });
  runtime.onModuleInit();

  const request = await new RequestBriefingUseCase(
    jobs,
    new BriefingJobQueuePublisherAdapter(queue, metrics),
    new AllowingSummaryQuota(),
    ids,
    clock,
  ).execute({
    tenantId: tenant,
    workspaceId: workspace,
    scope: { type: 'workspace' },
    idempotencyKey: 'briefing-workflow-smoke',
    correlationId: 'briefing-workflow-smoke',
  });

  assert(request.ok, 'briefing workflow smoke must create a briefing job');
  assert(queue.all().length === 1, `briefing request must enqueue one command, got ${queue.all().length}`);

  const loop = new BriefingJobQueueDrainLoop(
    new InMemorySummaryJobQueueReader(queue),
    new ExecuteBriefingJobCommandHandler(
      new ExecuteBriefingJobUseCase(
        jobs,
        artifacts,
        policies,
        new SelectedBriefingEvidenceSelector(),
        new DeterministicBriefingModelAdapter(),
        events,
        ids,
        clock,
      ),
      metrics,
      runtime,
    ),
    {
      enabled: true,
      intervalMs: 60_000,
      limit: 10,
      runOnStart: true,
    },
    metrics,
    new FixedClock(new Date('2026-06-23T08:31:30.000Z')),
  );

  await loop.onModuleInit();
  await loop.onApplicationShutdown('briefing-workflow-smoke-complete');
  await runtime.onApplicationShutdown('briefing-workflow-smoke-complete');

  const job = await jobs.findById({
    tenantId: tenant,
    workspaceId: workspace,
    briefingJobId: request.value.briefingJobId,
  });
  const snapshot = job?.toSnapshot();
  assert(snapshot?.status === 'completed', `expected completed briefing job, got ${snapshot?.status}`);
  assert(typeof snapshot.briefingId === 'string', 'briefing job must persist briefing artifact id');
  assert(queue.all().length === 0, `briefing queue must drain, got ${queue.all().length}`);
  assert(artifacts.all().length === 1, `briefing workflow must persist one artifact, got ${artifacts.all().length}`);
  const artifact = artifacts.all()[0]?.toSnapshot();
  assert(artifact !== undefined, 'briefing workflow must expose the persisted artifact snapshot');
  assert(artifact.readerBrief !== undefined, 'briefing workflow must persist the reader brief');
  assert(artifact.readerBrief.topReads.length > 0, 'reader brief must expose top reads');
  assert(artifact.citationMap.length > 0, 'briefing artifact must expose citations');
  assert(
    new Set(artifact.readerBrief.topReads.map(readerTopReadKey)).size === artifact.readerBrief.topReads.length,
    'reader brief top reads must not contain duplicate source links',
  );
  assert(
    artifact.readerBrief.sourceMix.some((source) => source.providerKey === 'github'),
    'reader brief source mix must include clustered GitHub evidence',
  );
  assert(
    artifact.readerBrief.sourceMix.some((source) => source.providerKey === 'reddit'),
    'reader brief source mix must include Reddit evidence',
  );
  assert(
    artifact.readerBrief.topReads[0]?.whyNow.includes('cross-source coverage'),
    'reader brief must explain why the top read matters now',
  );
  assert(events.all().length === 1, `briefing workflow must publish one briefing.ready event, got ${events.all().length}`);
  assert(
    metrics.counterValue('summary_jobs_total', {
      job_type: 'briefing',
      status: 'succeeded',
      worker: 'intelligence-worker',
    }) === 1,
    'briefing workflow must record succeeded metric',
  );

  console.log('Briefing workflow smoke OK');
}

const readerTopReadKey = (item: BriefingReaderItem): string =>
  item.canonicalUrl ??
  item.citationIds.join('|') ??
  `${item.providerKey}:${item.title}`;

class AllowingSummaryQuota implements SummaryQuotaPort {
  async reserveSummaryJob(): ReturnType<SummaryQuotaPort['reserveSummaryJob']> {
    return ok({
      remaining: 59,
      resetAt: '2026-06-23T09:00:00.000Z',
    });
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
