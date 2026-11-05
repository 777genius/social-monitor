import type { IdGenerator } from '@social-monitor/shared-kernel';

import {
  CommandOutboxDispatcher,
  type CommandOutboxRecord,
  type CommandOutboxStorePort,
} from './command-outbox-dispatcher';
import type {
  QueueCommandEnvelope,
  QueuePublisherPort,
} from './queue-command';

class SequenceIdGenerator implements IdGenerator {
  private next = 1;

  generate(): string {
    const value = `lease-${this.next}`;
    this.next += 1;
    return value;
  }
}

class FakeCommandOutbox implements CommandOutboxStorePort {
  readonly claims: Array<Parameters<CommandOutboxStorePort['claimPending']>[0]> = [];
  readonly renewals: Array<Parameters<CommandOutboxStorePort['renewClaims']>[0]> = [];
  allowRenewal = true;
  readonly published: Array<Parameters<CommandOutboxStorePort['markPublished']>[0]> = [];
  readonly failures: Array<Parameters<CommandOutboxStorePort['markFailed']>[0]> = [];

  constructor(private readonly records: readonly CommandOutboxRecord[]) {}

  async claimPending(
    params: Parameters<CommandOutboxStorePort['claimPending']>[0],
  ): Promise<readonly CommandOutboxRecord[]> {
    this.claims.push(params);
    return this.records;
  }

  async renewClaims(params: Parameters<CommandOutboxStorePort['renewClaims']>[0]): Promise<boolean> {
    this.renewals.push(params);
    return this.allowRenewal;
  }

  async markPublished(
    params: Parameters<CommandOutboxStorePort['markPublished']>[0],
  ): Promise<void> {
    this.published.push(params);
  }

  async markFailed(
    params: Parameters<CommandOutboxStorePort['markFailed']>[0],
  ): Promise<void> {
    this.failures.push(params);
  }
}

class FakeQueuePublisher implements QueuePublisherPort {
  readonly commands: QueueCommandEnvelope<Readonly<Record<string, unknown>>>[] = [];
  failure: Error | undefined;

  async publish<TPayload extends Readonly<Record<string, unknown>>>(
    command: QueueCommandEnvelope<TPayload>,
  ): Promise<void> {
    this.commands.push(command);
    if (this.failure !== undefined) {
      throw this.failure;
    }
  }
}

const now = new Date('2026-07-23T12:00:00.000Z');
const clock = { now: () => now };
const command = {
  commandId: '00000000-0000-7000-8000-000000000001',
  commandType: 'ingestion.scan.execute',
  schemaVersion: 1,
  correlationId: 'correlation-1',
  causationId: 'causation-1',
  payload: {
    tenantId: 'tenant-1',
    workspaceId: 'workspace-1',
    scanJobId: '00000000-0000-7000-8000-000000000001',
  },
} satisfies QueueCommandEnvelope<Readonly<Record<string, unknown>>>;

describe('CommandOutboxDispatcher', () => {
  it('publishes a leased command and marks the exact lease as published', async () => {
    const outbox = new FakeCommandOutbox([
      { id: command.commandId, command, publishAttempt: 1 },
    ]);
    const publisher = new FakeQueuePublisher();
    const dispatcher = new CommandOutboxDispatcher(
      outbox,
      publisher,
      new SequenceIdGenerator(),
      clock,
      { leaseMs: 15_000 },
    );

    await expect(dispatcher.dispatchBatch(10)).resolves.toEqual({
      published: 1,
      retrying: 0,
      failed: 0,
    });

    expect(publisher.commands).toEqual([command]);
    expect(outbox.claims).toEqual([
      {
        limit: 10,
        now,
        leaseOwner: 'lease-1',
        leasedUntil: new Date('2026-07-23T12:00:15.000Z'),
      },
    ]);
    expect(outbox.published).toEqual([
      {
        id: command.commandId,
        leaseOwner: 'lease-1',
        publishedAt: now,
      },
    ]);
  });

  it('releases a failed command for bounded retry with a redacted error', async () => {
    const outbox = new FakeCommandOutbox([
      { id: command.commandId, command, publishAttempt: 2 },
    ]);
    const publisher = new FakeQueuePublisher();
    publisher.failure = new Error(
      'RabbitMQ rejected Authorization: Bearer secret-token',
    );
    const dispatcher = new CommandOutboxDispatcher(
      outbox,
      publisher,
      new SequenceIdGenerator(),
      clock,
      { retryBaseMs: 1_000, retryMaxMs: 10_000 },
    );

    await expect(dispatcher.dispatchBatch(10)).resolves.toEqual({
      published: 0,
      retrying: 1,
      failed: 0,
    });

    expect(outbox.failures).toHaveLength(1);
    expect(outbox.failures[0]).toMatchObject({
      id: command.commandId,
      leaseOwner: 'lease-1',
      commandType: 'ingestion.scan.execute',
      availableAt: new Date('2026-07-23T12:00:02.000Z'),
      failedAt: now,
      terminal: false,
    });
    expect(outbox.failures[0]?.lastError).not.toContain('secret-token');
  });

  it('moves a poison command to terminal failure at the attempt limit', async () => {
    const outbox = new FakeCommandOutbox([
      { id: command.commandId, command, publishAttempt: 3 },
    ]);
    const publisher = new FakeQueuePublisher();
    publisher.failure = new Error('unavailable');
    const dispatcher = new CommandOutboxDispatcher(
      outbox,
      publisher,
      new SequenceIdGenerator(),
      clock,
      { maxAttempts: 3 },
    );

    await expect(dispatcher.dispatchBatch(1)).resolves.toEqual({
      published: 0,
      retrying: 0,
      failed: 1,
    });
    expect(outbox.failures[0]?.terminal).toBe(true);
    expect(outbox.failures[0]).toMatchObject({
      commandType: 'ingestion.scan.execute',
      failedAt: now,
    });
  });
  it('keeps later commands leased during a slow first publish', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
    try {
      const second = { ...command, commandId: '00000000-0000-7000-8000-000000000002' };
      const outbox = new FakeCommandOutbox([
        { id: command.commandId, command, publishAttempt: 1 },
        { id: second.commandId, command: second, publishAttempt: 1 },
      ]);
      let release!: () => void;
      const pending = new Promise<void>((resolve) => { release = resolve; });
      const publish = jest.fn(async (value: QueueCommandEnvelope<Readonly<Record<string, unknown>>>) => {
        if (value.commandId === command.commandId) await pending;
      });
      const dispatcher = new CommandOutboxDispatcher(
        outbox, { publish }, new SequenceIdGenerator(),
        { now: () => new Date() }, { leaseMs: 300 },
      );
      const dispatched = dispatcher.dispatchBatch(2);
      await jest.advanceTimersByTimeAsync(401);
      expect(publish).toHaveBeenCalledTimes(1);
      expect(outbox.renewals.length).toBeGreaterThanOrEqual(3);
      expect(outbox.renewals.every((item) => item.ids.length === 2)).toBe(true);
      release();
      await expect(dispatched).resolves.toEqual({ published: 2, retrying: 0, failed: 0 });
      expect(publish).toHaveBeenCalledTimes(2);
      expect(outbox.published.map((item) => item.id)).toEqual([command.commandId, second.commandId]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not publish the next command or acknowledge a send after lease ownership is lost', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
    try {
      const second = { ...command, commandId: '00000000-0000-7000-8000-000000000002' };
      const outbox = new FakeCommandOutbox([
        { id: command.commandId, command, publishAttempt: 1 },
        { id: second.commandId, command: second, publishAttempt: 1 },
      ]);
      outbox.allowRenewal = false;
      let release!: () => void;
      const pending = new Promise<void>((resolve) => { release = resolve; });
      const publish = jest.fn(async () => pending);
      const dispatched = new CommandOutboxDispatcher(
        outbox, { publish }, new SequenceIdGenerator(),
        { now: () => new Date() }, { leaseMs: 300 },
      ).dispatchBatch(2);
      await jest.advanceTimersByTimeAsync(101);
      expect(outbox.renewals).toHaveLength(1);
      release();
      await expect(dispatched).rejects.toThrow('ownership was lost');
      expect(publish).toHaveBeenCalledTimes(1);
      expect(outbox.published).toHaveLength(0);
      expect(outbox.failures).toHaveLength(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('treats even an undefined rejection as a failed publication', async () => {
    const outbox = new FakeCommandOutbox([{ id: command.commandId, command, publishAttempt: 1 }]);
    const dispatcher = new CommandOutboxDispatcher(outbox, {
      publish: async () => Promise.reject(undefined),
    }, new SequenceIdGenerator(), clock);
    await expect(dispatcher.dispatchBatch(1)).resolves.toMatchObject({ published: 0, retrying: 1 });
    expect(outbox.published).toHaveLength(0);
    expect(outbox.failures).toHaveLength(1);
  });

});
