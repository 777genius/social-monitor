import { InMemoryQueuePublisher } from './in-memory-queue-publisher';

describe('InMemoryQueuePublisher', () => {
  it('records published commands', async () => {
    const publisher = new InMemoryQueuePublisher();

    await publisher.publish({
      commandId: 'command-1',
      commandType: 'scan.execute',
      schemaVersion: 1,
      correlationId: 'correlation-1',
      payload: {
        scanJobId: 'scan-job-1',
      },
    });

    expect(publisher.all()).toEqual([
      {
        commandId: 'command-1',
        commandType: 'scan.execute',
        schemaVersion: 1,
        correlationId: 'correlation-1',
        payload: {
          scanJobId: 'scan-job-1',
        },
      },
    ]);
  });

  it('drains matching commands with a bounded batch size', async () => {
    const publisher = new InMemoryQueuePublisher();
    await publisher.publish({
      commandId: 'command-1',
      commandType: 'scan.execute',
      schemaVersion: 1,
      correlationId: 'correlation-1',
      payload: {
        scanJobId: 'scan-job-1',
      },
    });
    await publisher.publish({
      commandId: 'command-2',
      commandType: 'summary.execute',
      schemaVersion: 1,
      correlationId: 'correlation-2',
      payload: {
        summaryJobId: 'summary-job-1',
      },
    });

    const drained = publisher.drain({ commandType: 'scan.execute', limit: 1 });

    expect(drained.map((command) => command.commandId)).toEqual(['command-1']);
    expect(publisher.all().map((command) => command.commandId)).toEqual(['command-2']);
  });
});
