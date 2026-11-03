import { FixedClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { SequenceIdGenerator, FakeSourceBindings, FakeScanPolicies, FakeScanQueue, BackpressuredScanQueue, FakeIdempotency, AllowingScanRequestQuota, DenyingScanRequestQuota, makeBinding, makePolicy, FakeScanJobs, FakeOutbox, createRequestScanUseCase } from '../../../../test/support/monitoring/request-scan.fixture';

describe('request-scan dispatch', () => {
  it('requests scan for source binding with scan policy and appends an event', async () => {
    const bindings = new FakeSourceBindings();
    await bindings.save(makeBinding());
    const policies = new FakeScanPolicies();
    await policies.save(makePolicy());
    const outbox = new FakeOutbox();
    const queue = new FakeScanQueue();
    const useCase = createRequestScanUseCase(
      bindings,
      policies,
      new FakeScanJobs(),
      queue,
      outbox,
      new FakeIdempotency(),
      new AllowingScanRequestQuota(),
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-05T00:00:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1',
      idempotencyKey: 'scan-1',
      correlationId: 'correlation-1',
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.created).toBe(true);
    expect(result.ok && result.value.status).toBe('enqueued');
    expect(result.ok && result.value.requestDecision).toEqual({
      decision: 'created',
      reason: 'manual_scan_enqueued',
      createdNewScan: true,
      minimumIntervalSeconds: 60,
      configuredIntervalSeconds: 300,
      effectiveIntervalSeconds: 300,
      freshnessSeconds: 900,
      providerMinimumIntervalEnforced: false,
      signals: ['manual_scan_enqueued'],
    });
    expect(outbox.all()).toHaveLength(1);
    expect(queue.commands).toEqual([
      expect.objectContaining({
        interestId: 'interest-1',
        providerKey: 'fake-source',
        sourceQuery: { mode: 'search', query: 'binding-1' },
        retryBudget: 3,
      }),
    ]);
  });


  it('returns existing active scan job instead of enqueueing overlapping manual scan', async () => {
    const bindings = new FakeSourceBindings();
    await bindings.save(makeBinding());
    const policies = new FakeScanPolicies();
    await policies.save(makePolicy());
    const scanJobs = new FakeScanJobs();
    const queue = new FakeScanQueue();
    const useCase = createRequestScanUseCase(
      bindings,
      policies,
      scanJobs,
      queue,
      new FakeOutbox(),
      new FakeIdempotency(),
      new AllowingScanRequestQuota(),
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-05T00:00:00.000Z')),
    );

    const first = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1',
      idempotencyKey: 'manual-scan-1',
      correlationId: 'correlation-1',
    });
    const second = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1',
      idempotencyKey: 'manual-scan-2',
      correlationId: 'correlation-2',
    });

    if (!first.ok) {
      throw first.error;
    }

    expect(first.value.created).toBe(true);
    expect(second).toEqual({
      ok: true,
      value: {
        scanJobId: first.value.scanJobId,
        status: 'enqueued',
        created: false,
        requestDecision: {
          decision: 'active_scan',
          reason: 'scan_already_in_progress',
          createdNewScan: false,
          signals: ['active_scan_in_progress'],
        },
      },
    });
    expect(queue.commands).toHaveLength(1);
  });


  it('marks repeated idempotency key as replay without enqueueing another scan', async () => {
    const bindings = new FakeSourceBindings();
    await bindings.save(makeBinding());
    const policies = new FakeScanPolicies();
    await policies.save(makePolicy());
    const scanJobs = new FakeScanJobs();
    const queue = new FakeScanQueue();
    const useCase = createRequestScanUseCase(
      bindings,
      policies,
      scanJobs,
      queue,
      new FakeOutbox(),
      new FakeIdempotency(),
      new AllowingScanRequestQuota(),
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-05T00:00:00.000Z')),
    );

    const first = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1',
      idempotencyKey: 'manual-scan-replay',
      correlationId: 'correlation-1',
    });
    const second = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1',
      idempotencyKey: 'manual-scan-replay',
      correlationId: 'correlation-2',
    });

    if (!first.ok) {
      throw first.error;
    }

    expect(second).toEqual({
      ok: true,
      value: {
        scanJobId: first.value.scanJobId,
        status: 'enqueued',
        created: false,
        requestDecision: {
          decision: 'idempotent_replay',
          reason: 'idempotency_key_reused',
          createdNewScan: false,
          signals: ['idempotent_replay'],
        },
      },
    });
    expect(queue.commands).toHaveLength(1);
  });


  it('rejects new manual scan requests when the source binding is paused', async () => {
    const bindings = new FakeSourceBindings();
    await bindings.save(makeBinding().pause());
    const policies = new FakeScanPolicies();
    await policies.save(makePolicy());
    const queue = new FakeScanQueue();
    const quota = new AllowingScanRequestQuota();
    const useCase = createRequestScanUseCase(
      bindings,
      policies,
      new FakeScanJobs(),
      queue,
      new FakeOutbox(),
      new FakeIdempotency(),
      quota,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-05T00:00:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1',
      idempotencyKey: 'scan-paused-1',
      correlationId: 'correlation-1',
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'validation.failed',
        details: {
          sourceBindingId: 'binding-1',
          status: 'paused',
        },
      }),
    });
    expect(queue.commands).toHaveLength(0);
    expect(quota.reservationCount).toBe(0);
  });


  it('rejects request when scan policy is missing', async () => {
    const bindings = new FakeSourceBindings();
    await bindings.save(makeBinding());
    const useCase = createRequestScanUseCase(
      bindings,
      new FakeScanPolicies(),
      new FakeScanJobs(),
      new FakeScanQueue(),
      new FakeOutbox(),
      new FakeIdempotency(),
      new AllowingScanRequestQuota(),
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-05T00:00:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1',
      idempotencyKey: 'scan-1',
      correlationId: 'correlation-1',
    });

    expect(result.ok).toBe(false);
  });


  it('checks backpressure after idempotency and overlap gates but before quota, job creation or outbox', async () => {
    const bindings = new FakeSourceBindings();
    await bindings.save(makeBinding());
    const policies = new FakeScanPolicies();
    await policies.save(makePolicy());
    const scanJobs = new FakeScanJobs();
    const queue = new BackpressuredScanQueue();
    const outbox = new FakeOutbox();
    const quota = new AllowingScanRequestQuota();
    const useCase = createRequestScanUseCase(
      bindings,
      policies,
      scanJobs,
      queue,
      outbox,
      new FakeIdempotency(),
      quota,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-05T00:00:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1',
      idempotencyKey: 'scan-1',
      correlationId: 'correlation-1',
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'operation.backpressure',
      }),
    });
    await expect(
      scanJobs.findByIdempotencyKey({
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        idempotencyKey: 'scan-1',
      }),
    ).resolves.toBeNull();
    expect(quota.reservationCount).toBe(0);
    expect(queue.commands).toHaveLength(0);
    expect(outbox.all()).toHaveLength(0);
  });


  it('checks quota after idempotency, overlap and backpressure gates but before creating or enqueueing a scan job', async () => {
    const bindings = new FakeSourceBindings();
    await bindings.save(makeBinding());
    const policies = new FakeScanPolicies();
    await policies.save(makePolicy());
    const scanJobs = new FakeScanJobs();
    const queue = new FakeScanQueue();
    const outbox = new FakeOutbox();
    const useCase = createRequestScanUseCase(
      bindings,
      policies,
      scanJobs,
      queue,
      outbox,
      new FakeIdempotency(),
      new DenyingScanRequestQuota(),
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-05T00:00:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1',
      idempotencyKey: 'scan-1',
      correlationId: 'correlation-1',
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'operation.quota_exceeded',
      }),
    });
    await expect(
      scanJobs.findByIdempotencyKey({
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        idempotencyKey: 'scan-1',
      }),
    ).resolves.toBeNull();
    expect(queue.commands).toHaveLength(0);
    expect(outbox.all()).toHaveLength(0);
  });
});
