import { InMemoryFeedItemReadRepository } from '@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { InMemoryQueuePublisher } from '@social-monitor/platform-queue/adapters/in-memory';
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
import type { GetMessage, Message } from 'amqplib';

import { SummaryJobQueueDrainLoop } from '../apps/intelligence-worker/src/summary-job-queue-drain-loop';
import {
  InMemorySummaryJobQueueReader,
  RabbitMqSummaryJobQueueReader,
  type RabbitMqSummaryQueueReaderChannelPort,
} from '../apps/intelligence-worker/src/summary-job-queue-reader';

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `summary-queue-drain-loop-smoke-${this.nextId}`;
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
  await verifyInMemoryDrainLoop();
  await verifyRabbitMqReaderDelivery();

  console.log('Summary queue drain loop smoke OK');
}

async function verifyInMemoryDrainLoop(): Promise<void> {
  const tenant = tenantId('tenant-summary-queue-drain-loop-smoke');
  const workspace = workspaceId('workspace-summary-queue-drain-loop-smoke');
  const summaryJobId = 'summary-queue-drain-loop-smoke';
  const summaryJobs = new InMemorySummaryJobRepository();
  const summaryArtifacts = new InMemorySummaryArtifactRepository();
  const summaryPolicies = new InMemorySummaryPolicyRepository();
  const events = new InMemorySummaryEventPublisher();
  const metrics = new InMemoryMetricsRecorder();
  const runtime = new WorkerRuntime({ serviceName: 'intelligence-worker' });
  const queue = new InMemoryQueuePublisher();
  const clock = new FixedClock(new Date('2026-06-16T01:01:00.000Z'));
  runtime.onModuleInit();

  await summaryJobs.save(SummaryJob.request({
    id: summaryJobId,
    tenantId: tenant,
    workspaceId: workspace,
    topicId: 'topic-summary-queue-drain-loop-smoke',
    idempotencyKey: 'summary-queue-drain-loop-smoke:topic-summary-queue-drain-loop-smoke',
    requestedAt: new Date('2026-06-16T01:00:00.000Z'),
  }));

  await queue.publish({
    commandId: summaryJobId,
    commandType: 'summary.job.execute',
    schemaVersion: 1,
    correlationId: 'summary-queue-drain-loop-smoke',
    payload: {
      tenantId: tenant,
      workspaceId: workspace,
      summaryJobId,
    },
  });

  const loop = new SummaryJobQueueDrainLoop(
    new InMemorySummaryJobQueueReader(queue),
    new ExecuteSummaryJobCommandHandler(
      new ExecuteSummaryJobUseCase(
        summaryJobs,
        summaryArtifacts,
        summaryPolicies,
        new FeedSummaryEvidenceSelector(new InMemoryFeedItemReadRepository(), clock),
        new DeterministicSummaryModelAdapter(),
        events,
        new SequenceIdGenerator(),
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
  );

  await loop.onModuleInit();
  await loop.onApplicationShutdown('summary-queue-drain-loop-smoke-complete');
  await runtime.onApplicationShutdown('summary-queue-drain-loop-smoke-complete');

  const job = await summaryJobs.findById({ tenantId: tenant, workspaceId: workspace, summaryJobId });
  const snapshot = job?.toSnapshot();
  assert(snapshot?.status === 'no_signal', `expected no_signal summary job, got ${snapshot?.status}`);
  assert(queue.all().length === 0, `expected summary queue to drain, got ${queue.all().length}`);
  assert(events.all().length === 1, `expected one summary event, got ${events.all().length}`);
  assert(
    metrics.counterValue('summary_jobs_total', {
      job_type: 'summary',
      status: 'succeeded',
      worker: 'intelligence-worker',
    }) === 1,
    'summary queue drain loop must record succeeded metric',
  );
}

async function verifyRabbitMqReaderDelivery(): Promise<void> {
  const channel = new FakeRabbitMqSummaryQueueReaderChannel();
  channel.messages.push(messageFrom({
    commandId: 'summary-rabbit-reader-smoke',
    commandType: 'summary.job.execute',
    schemaVersion: 1,
    correlationId: 'summary-rabbit-reader-smoke',
    payload: {
      tenantId: 'tenant-summary-rabbit-reader-smoke',
      workspaceId: 'workspace-summary-rabbit-reader-smoke',
      summaryJobId: 'summary-rabbit-reader-smoke',
    },
  }));

  const reader = new RabbitMqSummaryJobQueueReader(channel, {
    queue: 'jobs.summary.execute',
    deadLetterExchange: 'dead.letters',
  });
  const deliveries = await reader.drain({ commandType: 'summary.job.execute', limit: 5 });

  assert(channel.assertedQueue === 'jobs.summary.execute', 'Rabbit reader must assert summary queue');
  assert(channel.prefetchCount === 5, 'Rabbit reader must set prefetch from limit');
  assert(deliveries.length === 1, `expected one Rabbit delivery, got ${deliveries.length}`);
  assert(deliveries[0]?.command.payload.summaryJobId === 'summary-rabbit-reader-smoke', 'summary job id mismatch');
  await deliveries[0]?.ack();
  assert(channel.acked === 1, `expected one Rabbit ack, got ${channel.acked}`);
}

class FakeRabbitMqSummaryQueueReaderChannel implements RabbitMqSummaryQueueReaderChannelPort {
  readonly messages: GetMessage[] = [];
  assertedQueue: string | undefined;
  prefetchCount = 0;
  acked = 0;
  nacked = 0;

  async assertQueue(queue: string): Promise<unknown> {
    this.assertedQueue = queue;

    return undefined;
  }

  async get(): Promise<GetMessage | false> {
    return this.messages.shift() ?? false;
  }

  async ack(): Promise<void> {
    this.acked += 1;
  }

  async nack(): Promise<void> {
    this.nacked += 1;
  }

  async prefetch(count: number): Promise<unknown> {
    this.prefetchCount = count;

    return undefined;
  }
}

function messageFrom(command: Readonly<Record<string, unknown>>): GetMessage {
  return {
    content: Buffer.from(JSON.stringify(command), 'utf8'),
  } as GetMessage & Message;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
