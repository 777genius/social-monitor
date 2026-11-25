import { WorkerRuntime } from './worker-runtime';

describe('WorkerRuntime', () => {
  it('drains active work and rejects new work during shutdown', async () => {
    const runtime = new WorkerRuntime({
      serviceName: 'test-worker',
      shutdownDrainTimeoutMs: 100,
    });
    runtime.onModuleInit();

    let finishWork: ((value: string) => void) | undefined;
    const work = runtime.runIfAccepting(
      'test.operation',
      () =>
        new Promise<string>((resolve) => {
          finishWork = resolve;
        }),
    );
    const shutdown = runtime.onApplicationShutdown('SIGTERM');

    await Promise.resolve();

    expect(runtime.isAcceptingWork()).toBe(false);
    expect(runtime.getActiveOperations()).toBe(1);
    await expect(runtime.runIfAccepting('test.operation', async () => 'late')).rejects.toMatchObject({
      code: 'operation.backpressure',
    });

    finishWork?.('done');

    await expect(work).resolves.toBe('done');
    await shutdown;

    expect(runtime.isStarted()).toBe(false);
    expect(runtime.getActiveOperations()).toBe(0);
  });
});
