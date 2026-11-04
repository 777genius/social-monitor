import request from 'supertest';

import { deterministicTestUuid } from './support/deterministic-test-uuid';
import { ScanExecutionRecoveryFixture } from './support/scan-execution-recovery-fixture';

jest.setTimeout(120_000);

describe('HTTP scan execution recovery through the Nest worker queue (e2e)', () => {
  let fixture: ScanExecutionRecoveryFixture | undefined;

  afterEach(async () => {
    await fixture?.close();
    fixture = undefined;
  });

  it('redelivers a persisted success after reporting fails without fetching or projecting it twice', async () => {
    const flow = fixture = await ScanExecutionRecoveryFixture.create('scan-outcome-recovery');
    const scan = await flow.createScan();
    const report = jest.spyOn(flow.reporter, 'reportSucceeded')
      .mockRejectedValueOnce(new Error('Fixture monitoring reporter unavailable'));

    await flow.runWorkerTick();
    expect(report).toHaveBeenCalledTimes(1);
    expect(flow.sourceFetchCount()).toBe(1);
    expect(flow.queue.all()).toHaveLength(1);
    expect(flow.queue.all()[0]?.payload.scanJobId).toBe(scan.scanJobId);
    expect(flow.failures.retries()).toHaveLength(0);
    expect(flow.failures.deadLettered()).toHaveLength(0);
    const savedAttempt = await flow.attempt(scan.scanJobId);
    expect(savedAttempt).toMatchObject({ status: 'succeeded', attemptNumber: 1, inserted: 2, projected: 2 });
    expect(flow.sourceItems.all()).toHaveLength(2);
    await flow.status(scan.scanJobId).expect(200).expect((response) => {
      expect(response.body).toMatchObject({ scanJobId: scan.scanJobId, status: 'enqueued' });
    });
    const persistedFeed = await flow.feed(scan.interestId).expect(200);
    expect(persistedFeed.body.items).toHaveLength(2);

    await flow.runWorkerTick();
    expect(report).toHaveBeenCalledTimes(2);
    expect(flow.sourceFetchCount()).toBe(1);
    expect(flow.queue.all()).toHaveLength(0);
    expect(flow.failures.retries()).toHaveLength(0);
    expect(flow.failures.deadLettered()).toHaveLength(0);
    expect(await flow.attempt(scan.scanJobId)).toEqual(savedAttempt);
    expect(flow.sourceItems.all()).toHaveLength(2);
    await flow.status(scan.scanJobId).expect(200).expect((response) => {
      expect(response.body).toMatchObject({ scanJobId: scan.scanJobId, status: 'succeeded' });
    });
    await flow.feed(scan.interestId).expect(200).expect((response) => {
      expect(response.body.items).toEqual(persistedFeed.body.items);
    });
  });

  it('acknowledges a provider failure and executes its claimed retry to HTTP success', async () => {
    const flow = fixture = await ScanExecutionRecoveryFixture.create('scan-retry-success', 1);
    const scan = await flow.createScan();

    await flow.runWorkerTick();
    expect(flow.sourceFetchCount()).toBe(1);
    expect(flow.queue.all()).toHaveLength(0);
    expect(flow.failures.retries()).toEqual([expect.objectContaining({
      scanJobId: scan.scanJobId, attemptNumber: 1, nextAttemptNumber: 2, retryBudget: 2,
      tenantId: flow.tenant, workspaceId: flow.workspace,
    })]);
    expect(flow.failures.deadLettered()).toHaveLength(0);
    expect(await flow.attempt(scan.scanJobId)).toMatchObject({
      status: 'failed', attemptNumber: 1, terminalFailure: false,
    });
    expect(flow.sourceItems.all()).toHaveLength(0);
    await flow.status(scan.scanJobId).expect(200).expect((response) => {
      expect(response.body).toMatchObject({ status: 'enqueued' });
      expect(response.body).not.toHaveProperty('completedAt');
    });
    await flow.feed(scan.interestId).expect(200).expect((response) => {
      expect(response.body.items).toEqual([]);
    });

    await flow.runWorkerTick();
    expect(flow.sourceFetchCount()).toBe(2);
    expect(flow.queue.all()).toHaveLength(0);
    expect(flow.failures.retries()).toHaveLength(0);
    expect(flow.failures.deadLettered()).toHaveLength(0);
    expect(await flow.attempt(scan.scanJobId)).toMatchObject({
      status: 'succeeded', attemptNumber: 2, inserted: 2, projected: 2,
    });
    expect(flow.sourceItems.all()).toHaveLength(2);
    await flow.status(scan.scanJobId).expect(200).expect((response) => {
      expect(response.body).toMatchObject({ scanJobId: scan.scanJobId, status: 'succeeded' });
    });
    await flow.feed(scan.interestId).expect(200).expect((response) => {
      expect(response.body.items).toHaveLength(2);
    });
  });

  it('exhausts two attempts into one scoped HTTP dead letter and leaves no executable work', async () => {
    const flow = fixture = await ScanExecutionRecoveryFixture.create('scan-retry-exhaustion', 2);
    const scan = await flow.createScan();

    await flow.runWorkerTick();
    expect(flow.queue.all()).toHaveLength(0);
    expect(flow.failures.retries()).toHaveLength(1);
    expect(flow.failures.deadLettered()).toHaveLength(0);
    await flow.status(scan.scanJobId).expect(200).expect((response) => {
      expect(response.body).toMatchObject({ status: 'enqueued' });
    });

    await flow.runWorkerTick();
    expect(flow.sourceFetchCount()).toBe(2);
    expect(flow.queue.all()).toHaveLength(0);
    expect(flow.failures.retries()).toHaveLength(0);
    const terminalAttempt = await flow.attempt(scan.scanJobId);
    expect(terminalAttempt).toMatchObject({ status: 'failed', attemptNumber: 2, terminalFailure: true });
    expect(flow.failures.deadLettered()).toEqual([expect.objectContaining({
      scanJobId: scan.scanJobId, attemptNumber: 2, retryBudget: 2,
      tenantId: flow.tenant, workspaceId: flow.workspace,
    })]);
    await flow.status(scan.scanJobId).expect(200).expect((response) => {
      expect(response.body).toMatchObject({
        scanJobId: scan.scanJobId, status: 'failed', completedAt: expect.any(String),
        failureReason: 'Fixture provider unavailable',
      });
    });
    const deadLetters = await request(flow.api.getHttpServer()).get('/ingestion/scan-dead-letters')
      .set(flow.headers).expect(200);
    expect(deadLetters.body.deadLetters).toEqual([expect.objectContaining({
      scanJobId: scan.scanJobId, attemptNumber: 2, retryBudget: 2,
      failureClass: 'provider_unavailable', correlationId: 'execution-recovery-correlation',
    })]);
    expect(deadLetters.body.deadLetters[0]).not.toHaveProperty('failureReason');
    for (const otherScope of [
      { 'x-tenant-id': deterministicTestUuid('scan-retry-other-tenant') },
      { 'x-workspace-id': deterministicTestUuid('scan-retry-other-workspace') },
    ]) {
      await request(flow.api.getHttpServer()).get('/ingestion/scan-dead-letters')
        .set({ ...flow.headers, ...otherScope }).expect(200)
        .expect({ deadLetters: [] });
    }
    await flow.feed(scan.interestId).expect(200).expect((response) => {
      expect(response.body.items).toEqual([]);
    });

    await flow.runWorkerTick();
    expect(flow.sourceFetchCount()).toBe(2);
    expect(flow.queue.all()).toHaveLength(0);
    expect(flow.failures.retries()).toHaveLength(0);
    expect(flow.failures.deadLettered()).toHaveLength(1);
    expect(await flow.attempt(scan.scanJobId)).toEqual(terminalAttempt);
    expect(flow.sourceItems.all()).toHaveLength(0);
  });
});
