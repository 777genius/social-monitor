import type { OnModuleDestroy } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { ExecuteSummaryJobCommandHandler } from '@social-monitor/summary/interfaces/queue/execute-summary-job-command.handler';

import { PrismaFeedConnection } from '@social-monitor/feed/adapters/persistence/prisma/prisma-feed-connection';
import { PrismaIdentityConnection } from '@social-monitor/identity/adapters/persistence/prisma/prisma-identity-connection';
import { MonitoringPrismaClientModule } from '@social-monitor/monitoring/interfaces/rest/monitoring-prisma-client.module';
import { MONITORING_PRISMA_CLIENT } from '@social-monitor/monitoring/interfaces/rest/monitoring-provider-tokens';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { WorkerRuntime } from '@social-monitor/platform-worker';
import { DomainError, FixedClock } from '@social-monitor/shared-kernel';
import type { GetMessage, Message } from 'amqplib';

import { SummaryJobQueueDrainLoop } from '../../../../apps/intelligence-worker/src/summary-job-queue-drain-loop';
import {
  RabbitMqSummaryJobQueueReader,
  type RabbitMqSummaryQueueReaderChannelPort,
} from '../../../../apps/intelligence-worker/src/summary-job-queue-reader';

import {
  defaultPostgresRuntimePoolConfig,
  getPostgresRuntimePoolDiagnostics,
  teardownPostgresRuntimePoolForTests,
} from './postgres-runtime-pool';

describe('real PrismaPg and pg Pool Nest lifecycle', () => {
  afterEach(async () => {
    await teardownPostgresRuntimePoolForTests();
  });

  it('quiesces module work before WorkerRuntime drain, Prisma disconnect, and pool end', async () => {
    const config = defaultPostgresRuntimePoolConfig(
      'postgresql://runtime.invalid/social_monitor',
      'api-gateway',
    );
    const drain = new DrainProbe();
    const worker = new WorkerRuntime({ serviceName: 'lifecycle-worker' });
    const moduleRef = await Test.createTestingModule({
      providers: [
        { provide: DrainProbe, useValue: drain },
        { provide: WorkerRuntime, useValue: worker },
        {
          provide: PrismaFeedConnection,
          useFactory: () => PrismaFeedConnection.create(config),
        },
        {
          provide: PrismaIdentityConnection,
          useFactory: () => PrismaIdentityConnection.create(config),
        },
      ],
    }).compile();
    await moduleRef.init();
    expect(worker.isAcceptingWork()).toBe(true);

    expect(getPostgresRuntimePoolDiagnostics()).toEqual({
      poolInstances: 1,
      prismaClientInstances: 1,
      activeConnectionLeases: 2,
      closing: false,
    });

    const closePromise = moduleRef.close();
    await drain.waitUntilStarted();
    expect(drain.started).toBe(true);
    expect(worker.isAcceptingWork()).toBe(true);
    try {
      expect(getPostgresRuntimePoolDiagnostics()).toEqual({
        poolInstances: 1,
        prismaClientInstances: 1,
        activeConnectionLeases: 2,
        closing: false,
      });
    } finally {
      drain.allowCompletion();
      await closePromise;
    }
    expect(drain.events).toEqual(['drain-start', 'drain-finished']);
    expect(worker.isStarted()).toBe(false);
    expect(getPostgresRuntimePoolDiagnostics()).toEqual({
      poolInstances: 0,
      prismaClientInstances: 0,
      activeConnectionLeases: 0,
      closing: false,
    });
  });

  it('closes the production monitoring provider during Nest shutdown', async () => {
    const originalEnv = process.env;
    process.env = {
      ...originalEnv,
      DATABASE_URL: 'postgresql://runtime.invalid/social_monitor',
      MONITORING_PERSISTENCE: 'prisma',
      POSTGRES_RUNTIME_PROCESS: 'api-gateway',
      POSTGRES_RUNTIME_POOL_MIN: '0',
      POSTGRES_RUNTIME_POOL_MAX: '2',
      SOCIAL_MONITOR_RUNTIME_PROFILE: 'beta',
    };

    try {
      const moduleRef = await Test.createTestingModule({
        imports: [MonitoringPrismaClientModule],
      }).compile();
      await moduleRef.init();
      expect(moduleRef.get(MONITORING_PRISMA_CLIENT)).not.toBeNull();
      expect(getPostgresRuntimePoolDiagnostics().activeConnectionLeases).toBe(1);

      await moduleRef.close();
      expect(getPostgresRuntimePoolDiagnostics()).toEqual({
        poolInstances: 0,
        prismaClientInstances: 0,
        activeConnectionLeases: 0,
        closing: false,
      });
    } finally {
      process.env = originalEnv;
    }
  });

  it('quiesces RabbitMQ fetch, finishes active work, and requeues held deliveries before worker drain', async () => {
    const channel = new LifecycleRabbitMqChannel([
      summaryMessage('shutdown-first'),
      summaryMessage('shutdown-held'),
    ]);
    const runtime = new WorkerRuntime({ serviceName: 'intelligence-worker' });
    runtime.onModuleInit();
    const firstStarted = deferred<void>();
    const finishFirst = deferred<void>();
    const handled: string[] = [];
    const handler = {
      handle: async (command: { readonly commandId: string }) =>
        runtime.runIfAccepting(command.commandId, async () => {
          handled.push(command.commandId);
          firstStarted.resolve();
          await finishFirst.promise;
        }),
    } as unknown as ExecuteSummaryJobCommandHandler;
    const loop = new SummaryJobQueueDrainLoop(
      new RabbitMqSummaryJobQueueReader(channel, {
        queue: 'jobs.summary.execute',
        deadLetterExchange: 'social-monitor.commands.dlx',
        queueType: 'quorum',
        deliveryLimit: 20,
      }),
      handler,
      { enabled: true, intervalMs: 1, limit: 2, runOnStart: false },
      new InMemoryMetricsRecorder(),
      new FixedClock(new Date('2026-07-14T00:00:00.000Z')),
    );

    await loop.onModuleInit();
    await firstStarted.promise;
    const queueShutdown = loop.onModuleDestroy();
    await Promise.resolve();

    expect(runtime.isAcceptingWork()).toBe(true);
    expect(runtime.getActiveOperations()).toBe(1);
    finishFirst.resolve();
    await queueShutdown;
    await runtime.beforeApplicationShutdown('SIGTERM');

    expect(handled).toEqual(['shutdown-first']);
    expect(channel.ackedCommandIds).toEqual(['shutdown-first']);
    expect(channel.nackedCommands).toEqual([
      { commandId: 'shutdown-held', requeue: true },
    ]);
    expect(runtime.getActiveOperations()).toBe(0);
  });

  it('requeues WorkerRuntime backpressure instead of dead-lettering a valid RabbitMQ command', async () => {
    const channel = new LifecycleRabbitMqChannel([
      summaryMessage('backpressure-command'),
    ]);
    const handler = {
      handle: async () => {
        throw new DomainError(
          'operation.backpressure',
          'Worker is draining and not accepting new work',
        );
      },
    } as unknown as ExecuteSummaryJobCommandHandler;
    const loop = new SummaryJobQueueDrainLoop(
      new RabbitMqSummaryJobQueueReader(channel, {
        queue: 'jobs.summary.execute',
        deadLetterExchange: 'social-monitor.commands.dlx',
        queueType: 'quorum',
        deliveryLimit: 20,
      }),
      handler,
      { enabled: true, intervalMs: 1, limit: 1, runOnStart: false },
      new InMemoryMetricsRecorder(),
      new FixedClock(new Date('2026-07-14T00:00:00.000Z')),
    );

    await loop.onModuleInit();
    await channel.waitUntilNacked();
    await loop.onModuleDestroy();

    expect(channel.ackedCommandIds).toEqual([]);
    expect(channel.nackedCommands).toEqual([
      { commandId: 'backpressure-command', requeue: true },
    ]);
  });

  it('does not advance resource shutdown when the worker drain warning threshold elapses', async () => {
    jest.useFakeTimers();
    try {
      const runtime = new WorkerRuntime({
        serviceName: 'intelligence-worker',
        shutdownDrainTimeoutMs: 10,
      });
      runtime.onModuleInit();
      const finishWork = deferred<void>();
      const work = runtime.runIfAccepting(
        'slow-command',
        () => finishWork.promise,
      );
      let shutdownFinished = false;
      const shutdown = runtime.beforeApplicationShutdown('SIGTERM').then(() => {
        shutdownFinished = true;
      });

      await jest.advanceTimersByTimeAsync(11);
      expect(shutdownFinished).toBe(false);
      expect(runtime.getActiveOperations()).toBe(1);

      finishWork.resolve();
      await work;
      await shutdown;
      expect(shutdownFinished).toBe(true);
      expect(runtime.getActiveOperations()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});

class DrainProbe implements OnModuleDestroy {
  readonly events: string[] = [];
  private readonly completion = deferred<void>();
  private readonly start = deferred<void>();
  started = false;

  async onModuleDestroy(): Promise<void> {
    this.started = true;
    this.events.push('drain-start');
    this.start.resolve();
    await this.completion.promise;
    this.events.push('drain-finished');
  }

  waitUntilStarted(): Promise<void> {
    return this.start.promise;
  }

  allowCompletion(): void {
    this.completion.resolve();
  }
}

type Deferred<T> = {
  readonly promise: Promise<T>;
  resolve(value?: T): void;
};

function deferred<T>(): Deferred<T> {
  let resolvePromise: ((value: T | PromiseLike<T>) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve(value?: T): void {
      resolvePromise?.(value as T);
    },
  };
}

class LifecycleRabbitMqChannel
  implements RabbitMqSummaryQueueReaderChannelPort
{
  readonly ackedCommandIds: string[] = [];
  readonly nackedCommands: Array<{
    readonly commandId: string;
    readonly requeue: boolean;
  }> = [];
  private readonly nacked = deferred<void>();

  constructor(private readonly messages: GetMessage[]) {}

  async assertExchange(): Promise<void> {
    return undefined;
  }

  async assertQueue(): Promise<void> {
    return undefined;
  }

  async get(): Promise<GetMessage | false> {
    return this.messages.shift() ?? false;
  }

  async ack(message: Message): Promise<void> {
    this.ackedCommandIds.push(commandIdFrom(message));
  }

  async nack(
    message: Message,
    _allUpTo: boolean,
    requeue: boolean,
  ): Promise<void> {
    this.nackedCommands.push({ commandId: commandIdFrom(message), requeue });
    this.nacked.resolve();
  }

  async prefetch(): Promise<void> {
    return undefined;
  }

  waitUntilNacked(): Promise<void> {
    return this.nacked.promise;
  }
}

function summaryMessage(commandId: string): GetMessage {
  return {
    content: Buffer.from(
      JSON.stringify({
        commandId,
        commandType: 'summary.job.execute',
        schemaVersion: 1,
        correlationId: `${commandId}-correlation`,
        payload: {
          tenantId: 'tenant-shutdown',
          workspaceId: 'workspace-shutdown',
          summaryJobId: commandId,
        },
      }),
    ),
    fields: { redelivered: false },
    properties: {
      headers: {},
      correlationId: `${commandId}-correlation`,
      messageId: commandId,
    },
  } as GetMessage & Message;
}

function commandIdFrom(message: Message): string {
  const parsed = JSON.parse(message.content.toString('utf8')) as {
    readonly commandId: string;
  };
  return parsed.commandId;
}
