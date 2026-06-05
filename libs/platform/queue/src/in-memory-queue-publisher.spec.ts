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
});
