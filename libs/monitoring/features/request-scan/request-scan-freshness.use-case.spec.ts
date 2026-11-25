import { FixedClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { ScanJob, ScanPolicy } from '../../domain';
import { SequenceIdGenerator, FakeSourceBindings, FakeScanPolicies, FakeScanQueue, FakeIdempotency, AllowingScanRequestQuota, makeBinding, makePolicy, FakeScanJobs, FakeOutbox, createRequestScanUseCase } from '../../../../test/support/monitoring/request-scan.fixture';

describe('request-scan freshness', () => {
  it('returns latest fresh successful scan job instead of enqueueing duplicate manual scan', async () => {
    const bindings = new FakeSourceBindings();
    await bindings.save(makeBinding());
    const policies = new FakeScanPolicies();
    await policies.save(makePolicy());
    const scanJobs = new FakeScanJobs();
    await scanJobs.save(
      ScanJob.request({
        id: 'fresh-successful-scan-job',
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        sourceBindingId: 'binding-1',
        scanPolicyId: 'policy-1',
        idempotencyKey: 'fresh-successful-scan',
        requestedAt: new Date('2026-06-05T00:05:00.000Z'),
      })
        .markEnqueued({
          enqueuedAt: new Date('2026-06-05T00:05:01.000Z'),
        })
        .markSucceeded({
          completedAt: new Date('2026-06-05T00:06:00.000Z'),
        }),
    );
    const queue = new FakeScanQueue();
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
      new FixedClock(new Date('2026-06-05T00:10:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1',
      idempotencyKey: 'manual-scan-fresh-skip',
      correlationId: 'correlation-fresh-skip',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        scanJobId: 'fresh-successful-scan-job',
        status: 'succeeded',
        created: false,
        requestDecision: {
          decision: 'fresh_success',
          reason: 'latest_success_still_fresh',
          createdNewScan: false,
          minimumIntervalSeconds: 60,
          configuredIntervalSeconds: 300,
          effectiveIntervalSeconds: 300,
          freshnessSeconds: 900,
          providerMinimumIntervalEnforced: false,
          nextEligibleAt: '2026-06-05T00:21:00.000Z',
          waitSeconds: 660,
          freshnessDeadlineAt: '2026-06-05T00:21:00.000Z',
          signals: ['fresh_success'],
        },
      },
    });
    expect(queue.commands).toHaveLength(0);
    expect(outbox.all()).toHaveLength(0);
    expect(quota.reservationCount).toBe(0);
    await expect(
      scanJobs.findByIdempotencyKey({
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        idempotencyKey: 'manual-scan-fresh-skip',
      }),
    ).resolves.toBeNull();
  });


  it('treats the exact freshness deadline as still fresh for manual scan requests', async () => {
    const bindings = new FakeSourceBindings();
    await bindings.save(makeBinding());
    const policies = new FakeScanPolicies();
    await policies.save(makePolicy());
    const scanJobs = new FakeScanJobs();
    await scanJobs.save(
      ScanJob.request({
        id: 'fresh-boundary-successful-scan-job',
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        sourceBindingId: 'binding-1',
        scanPolicyId: 'policy-1',
        idempotencyKey: 'fresh-boundary-successful-scan',
        requestedAt: new Date('2026-06-05T00:04:00.000Z'),
      })
        .markEnqueued({
          enqueuedAt: new Date('2026-06-05T00:04:01.000Z'),
        })
        .markSucceeded({
          completedAt: new Date('2026-06-05T00:05:00.000Z'),
        }),
    );
    const queue = new FakeScanQueue();
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
      new FixedClock(new Date('2026-06-05T00:20:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1',
      idempotencyKey: 'manual-scan-fresh-boundary-skip',
      correlationId: 'correlation-fresh-boundary-skip',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        scanJobId: 'fresh-boundary-successful-scan-job',
        status: 'succeeded',
        created: false,
        requestDecision: {
          decision: 'fresh_success',
          reason: 'latest_success_still_fresh',
          createdNewScan: false,
          minimumIntervalSeconds: 60,
          configuredIntervalSeconds: 300,
          effectiveIntervalSeconds: 300,
          freshnessSeconds: 900,
          providerMinimumIntervalEnforced: false,
          nextEligibleAt: '2026-06-05T00:20:00.000Z',
          waitSeconds: 0,
          freshnessDeadlineAt: '2026-06-05T00:20:00.000Z',
          signals: ['fresh_success'],
        },
      },
    });
    expect(queue.commands).toHaveLength(0);
    expect(outbox.all()).toHaveLength(0);
    expect(quota.reservationCount).toBe(0);
    await expect(
      scanJobs.findByIdempotencyKey({
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        idempotencyKey: 'manual-scan-fresh-boundary-skip',
      }),
    ).resolves.toBeNull();
  });


  it('uses provider minimum cadence when blocking duplicate manual scans for legacy policy', async () => {
    const bindings = new FakeSourceBindings();
    await bindings.save(makeBinding('reddit'));
    const policies = new FakeScanPolicies();
    await policies.save(
      ScanPolicy.create({
        id: 'policy-1',
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        sourceBindingId: 'binding-1',
        intervalSeconds: 60,
        freshnessSeconds: 60,
        retryBudget: 3,
        nextRunAt: new Date('2026-06-05T00:00:00.000Z'),
        createdAt: new Date('2026-06-05T00:00:00.000Z'),
      }),
    );
    const scanJobs = new FakeScanJobs();
    await scanJobs.save(
      ScanJob.request({
        id: 'recent-reddit-successful-scan-job',
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        sourceBindingId: 'binding-1',
        scanPolicyId: 'policy-1',
        idempotencyKey: 'recent-reddit-successful-scan',
        requestedAt: new Date('2026-06-05T00:04:00.000Z'),
      })
        .markEnqueued({
          enqueuedAt: new Date('2026-06-05T00:04:01.000Z'),
        })
        .markSucceeded({
          completedAt: new Date('2026-06-05T00:05:00.000Z'),
        }),
    );
    const queue = new FakeScanQueue();
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
      new FixedClock(new Date('2026-06-05T00:10:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1',
      idempotencyKey: 'manual-scan-provider-minimum-fresh-skip',
      correlationId: 'correlation-provider-minimum-fresh-skip',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        scanJobId: 'recent-reddit-successful-scan-job',
        status: 'succeeded',
        created: false,
        requestDecision: {
          decision: 'fresh_success',
          reason: 'latest_success_still_fresh',
          createdNewScan: false,
          minimumIntervalSeconds: 900,
          configuredIntervalSeconds: 60,
          effectiveIntervalSeconds: 900,
          freshnessSeconds: 900,
          providerMinimumIntervalEnforced: true,
          nextEligibleAt: '2026-06-05T00:20:00.000Z',
          waitSeconds: 600,
          freshnessDeadlineAt: '2026-06-05T00:20:00.000Z',
          signals: ['fresh_success', 'provider_minimum_interval_enforced'],
        },
      },
    });
    expect(queue.commands).toHaveLength(0);
    expect(outbox.all()).toHaveLength(0);
    expect(quota.reservationCount).toBe(0);
  });


});
