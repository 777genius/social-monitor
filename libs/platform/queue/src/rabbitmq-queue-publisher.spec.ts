import type { RabbitMqPublishOptions, RabbitMqQueueChannelPort } from './rabbitmq-queue-publisher';
import { RabbitMqQueuePublisher } from './rabbitmq-queue-publisher';

class FakeRabbitMqChannel implements RabbitMqQueueChannelPort {
  readonly exchanges: unknown[] = [];
  readonly queues: unknown[] = [];
  readonly bindings: unknown[] = [];
  readonly published: Array<{
    readonly exchange: string;
    readonly routingKey: string;
    readonly content: Buffer;
    readonly options: RabbitMqPublishOptions;
  }> = [];

  publishAccepted = true;

  async assertExchange(
    exchange: string,
    type: 'direct' | 'topic',
    options: { readonly durable: boolean },
  ): Promise<void> {
    this.exchanges.push({ exchange, type, options });
  }

  async assertQueue(
    queue: string,
    options: {
      readonly durable: boolean;
      readonly arguments?: Readonly<Record<string, string | number | boolean>>;
    },
  ): Promise<void> {
    this.queues.push({ queue, options });
  }

  async bindQueue(queue: string, exchange: string, routingKey: string): Promise<void> {
    this.bindings.push({ queue, exchange, routingKey });
  }

  publish(
    exchange: string,
    routingKey: string,
    content: Buffer,
    options: RabbitMqPublishOptions,
  ): boolean {
    this.published.push({ exchange, routingKey, content, options });

    return this.publishAccepted;
  }
}

describe('RabbitMqQueuePublisher', () => {
  it('publishes durable queue commands with configured routing metadata', async () => {
    const channel = new FakeRabbitMqChannel();
    const publisher = new RabbitMqQueuePublisher(channel, {
      exchange: 'social-monitor.jobs',
      routes: {
        'ingestion.scan.execute': {
          queue: 'jobs.freshness.scan',
          routingKey: 'scan.execute',
          deadLetterExchange: 'social-monitor.jobs.dlx',
        },
      },
    });

    await publisher.publish({
      commandId: 'scan-job-1',
      commandType: 'ingestion.scan.execute',
      schemaVersion: 1,
      correlationId: 'correlation-1',
      causationId: 'scan-policy-1',
      payload: {
        tenantId: 'tenant-1',
        workspaceId: 'workspace-1',
        scanJobId: 'scan-job-1',
      },
    });

    expect(channel.exchanges).toEqual([
      {
        exchange: 'social-monitor.jobs',
        type: 'direct',
        options: { durable: true },
      },
    ]);
    expect(channel.queues).toEqual([
      {
        queue: 'jobs.freshness.scan',
        options: {
          durable: true,
          arguments: {
            'x-dead-letter-exchange': 'social-monitor.jobs.dlx',
          },
        },
      },
    ]);
    expect(channel.bindings).toEqual([
      {
        queue: 'jobs.freshness.scan',
        exchange: 'social-monitor.jobs',
        routingKey: 'scan.execute',
      },
    ]);
    expect(channel.published).toHaveLength(1);
    expect(channel.published[0]?.exchange).toBe('social-monitor.jobs');
    expect(channel.published[0]?.routingKey).toBe('scan.execute');
    expect(JSON.parse(channel.published[0]?.content.toString('utf8') ?? '{}')).toMatchObject({
      commandId: 'scan-job-1',
      commandType: 'ingestion.scan.execute',
      payload: {
        scanJobId: 'scan-job-1',
      },
    });
    expect(channel.published[0]?.options).toMatchObject({
      contentType: 'application/json',
      deliveryMode: 2,
      mandatory: true,
      messageId: 'scan-job-1',
      correlationId: 'correlation-1',
      type: 'ingestion.scan.execute',
      headers: {
        command_type: 'ingestion.scan.execute',
        schema_version: 1,
        causation_id: 'scan-policy-1',
      },
    });
  });

  it('fails fast when the broker reports publish backpressure', async () => {
    const channel = new FakeRabbitMqChannel();
    channel.publishAccepted = false;

    await expect(new RabbitMqQueuePublisher(channel, {
      exchange: 'social-monitor.jobs',
    }).publish({
      commandId: 'summary-job-1',
      commandType: 'summary.job.execute',
      schemaVersion: 1,
      correlationId: 'correlation-1',
      payload: {
        summaryJobId: 'summary-job-1',
      },
    })).rejects.toThrow('RabbitMQ publish backpressure');
  });

  it('rejects oversized command payloads before publishing', async () => {
    const channel = new FakeRabbitMqChannel();

    await expect(new RabbitMqQueuePublisher(channel, {
      exchange: 'social-monitor.jobs',
      maxPayloadBytes: 32,
    }).publish({
      commandId: 'command-1',
      commandType: 'summary.job.execute',
      schemaVersion: 1,
      correlationId: 'correlation-1',
      payload: {
        text: 'x'.repeat(128),
      },
    })).rejects.toThrow('max payload size');
    expect(channel.published).toHaveLength(0);
  });
});
