import { FixedClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { ScanJob } from '../../domain';
import { SequenceIdGenerator, FakeSourceBindings, FakeScanPolicies, FakeScanQueue, FakeIdempotency, AllowingScanRequestQuota, makeBinding, makePolicy, FakeScanJobs, FakeOutbox, createRequestScanUseCase } from '../../../../test/support/monitoring/request-scan.fixture';

describe('request-scan provider-backoff', () => {
  it('returns latest rate-limited failed scan job while provider backoff is active', async () => {
    const bindings = new FakeSourceBindings();
    await bindings.save(makeBinding());
    const policies = new FakeScanPolicies();
    await policies.save(makePolicy());
    const scanJobs = new FakeScanJobs();
    await scanJobs.save(
      ScanJob.request({
        id: 'rate-limited-scan-job',
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        sourceBindingId: 'binding-1',
        scanPolicyId: 'policy-1',
        idempotencyKey: 'rate-limited-scan',
        requestedAt: new Date('2026-06-05T00:05:00.000Z'),
      })
        .markEnqueued({
          enqueuedAt: new Date('2026-06-05T00:05:01.000Z'),
        })
        .markFailed({
          completedAt: new Date('2026-06-05T00:06:00.000Z'),
          failureReason: 'Provider rate limit 429',
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
      idempotencyKey: 'manual-scan-rate-limit-backoff',
      correlationId: 'correlation-rate-limit-backoff',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        scanJobId: 'rate-limited-scan-job',
        status: 'failed',
        created: false,
        requestDecision: {
          decision: 'rate_limit_backoff',
          reason: 'provider_rate_limit_backoff_active',
          createdNewScan: false,
          minimumIntervalSeconds: 60,
          configuredIntervalSeconds: 300,
          effectiveIntervalSeconds: 300,
          freshnessSeconds: 900,
          providerMinimumIntervalEnforced: false,
          nextEligibleAt: '2026-06-05T00:11:00.000Z',
          waitSeconds: 60,
          rateLimitBackoffUntil: '2026-06-05T00:11:00.000Z',
          providerHealthState: 'degraded',
          signals: ['rate_limit_backoff'],
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
        idempotencyKey: 'manual-scan-rate-limit-backoff',
      }),
    ).resolves.toBeNull();
  });


  it('returns bounded transient backoff for high-cadence provider rate limits', async () => {
    const bindings = new FakeSourceBindings();
    await bindings.save(makeBinding('github-repo-radar'));
    const policies = new FakeScanPolicies();
    await policies.save(makePolicy());
    const scanJobs = new FakeScanJobs();
    await scanJobs.save(
      ScanJob.request({
        id: 'repo-radar-rate-limited-scan-job',
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        sourceBindingId: 'binding-1',
        scanPolicyId: 'policy-1',
        idempotencyKey: 'repo-radar-rate-limited-scan',
        requestedAt: new Date('2026-06-05T00:05:00.000Z'),
      })
        .markEnqueued({
          enqueuedAt: new Date('2026-06-05T00:05:01.000Z'),
        })
        .markFailed({
          completedAt: new Date('2026-06-05T00:06:00.000Z'),
          failureReason: 'Provider rate limit 429',
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
      idempotencyKey: 'manual-scan-repo-radar-rate-limit-backoff',
      correlationId: 'correlation-repo-radar-rate-limit-backoff',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        scanJobId: 'repo-radar-rate-limited-scan-job',
        status: 'failed',
        created: false,
        requestDecision: {
          decision: 'rate_limit_backoff',
          reason: 'provider_rate_limit_backoff_active',
          createdNewScan: false,
          minimumIntervalSeconds: 21_600,
          configuredIntervalSeconds: 300,
          effectiveIntervalSeconds: 21_600,
          freshnessSeconds: 21_600,
          providerMinimumIntervalEnforced: true,
          nextEligibleAt: '2026-06-05T00:21:00.000Z',
          waitSeconds: 660,
          rateLimitBackoffUntil: '2026-06-05T00:21:00.000Z',
          providerHealthState: 'degraded',
          signals: ['rate_limit_backoff', 'provider_minimum_interval_enforced'],
        },
      },
    });
    expect(queue.commands).toHaveLength(0);
    expect(outbox.all()).toHaveLength(0);
    expect(quota.reservationCount).toBe(0);
  });


  it('returns latest provider failure while repeated auth-failure backoff is active', async () => {
    const bindings = new FakeSourceBindings();
    await bindings.save(makeBinding('reddit'));
    const policies = new FakeScanPolicies();
    await policies.save(makePolicy());
    const scanJobs = new FakeScanJobs();
    for (const [id, requestedAt, completedAt] of [
      ['auth-failed-scan-job-2', '2026-06-05T00:05:00.000Z', '2026-06-05T00:06:00.000Z'],
      ['auth-failed-scan-job-1', '2026-06-05T00:04:00.000Z', '2026-06-05T00:05:00.000Z'],
    ] as const) {
      await scanJobs.save(
        ScanJob.request({
          id,
          tenantId: tenantId('tenant-1'),
          workspaceId: workspaceId('workspace-1'),
          sourceBindingId: 'binding-1',
          scanPolicyId: 'policy-1',
          idempotencyKey: `manual-${id}`,
          requestedAt: new Date(requestedAt),
        })
          .markEnqueued({
            enqueuedAt: new Date(new Date(requestedAt).getTime() + 1_000),
          })
          .markFailed({
            completedAt: new Date(completedAt),
            failureReason: 'kind=auth_failed provider credential rejected',
          }),
      );
    }
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
      idempotencyKey: 'manual-scan-provider-failure-backoff',
      correlationId: 'correlation-provider-failure-backoff',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        scanJobId: 'auth-failed-scan-job-2',
        status: 'failed',
        created: false,
        requestDecision: {
          decision: 'provider_failure_backoff',
          reason: 'provider_failure_backoff_active',
          createdNewScan: false,
          minimumIntervalSeconds: 900,
          configuredIntervalSeconds: 300,
          effectiveIntervalSeconds: 900,
          freshnessSeconds: 900,
          providerMinimumIntervalEnforced: true,
          nextEligibleAt: '2026-06-05T00:36:00.000Z',
          waitSeconds: 1560,
          providerFailureBackoffUntil: '2026-06-05T00:36:00.000Z',
          providerHealthState: 'degraded',
          signals: ['provider_failure_backoff', 'provider_minimum_interval_enforced'],
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
        idempotencyKey: 'manual-scan-provider-failure-backoff',
      }),
    ).resolves.toBeNull();
  });


  it('returns bounded transient backoff for high-cadence provider failures', async () => {
    const bindings = new FakeSourceBindings();
    await bindings.save(makeBinding('github-repo-radar'));
    const policies = new FakeScanPolicies();
    await policies.save(makePolicy());
    const scanJobs = new FakeScanJobs();
    for (const [id, requestedAt, completedAt] of [
      ['repo-radar-unavailable-scan-job-2', '2026-06-05T00:05:00.000Z', '2026-06-05T00:06:00.000Z'],
      ['repo-radar-unavailable-scan-job-1', '2026-06-05T00:04:00.000Z', '2026-06-05T00:05:00.000Z'],
    ] as const) {
      await scanJobs.save(
        ScanJob.request({
          id,
          tenantId: tenantId('tenant-1'),
          workspaceId: workspaceId('workspace-1'),
          sourceBindingId: 'binding-1',
          scanPolicyId: 'policy-1',
          idempotencyKey: `manual-${id}`,
          requestedAt: new Date(requestedAt),
        })
          .markEnqueued({
            enqueuedAt: new Date(new Date(requestedAt).getTime() + 1_000),
          })
          .markFailed({
            completedAt: new Date(completedAt),
            failureReason: 'Provider unavailable while reading repo radar',
          }),
      );
    }
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
      idempotencyKey: 'manual-scan-repo-radar-provider-failure-backoff',
      correlationId: 'correlation-repo-radar-provider-failure-backoff',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        scanJobId: 'repo-radar-unavailable-scan-job-2',
        status: 'failed',
        created: false,
        requestDecision: {
          decision: 'provider_failure_backoff',
          reason: 'provider_failure_backoff_active',
          createdNewScan: false,
          minimumIntervalSeconds: 21_600,
          configuredIntervalSeconds: 300,
          effectiveIntervalSeconds: 21_600,
          freshnessSeconds: 21_600,
          providerMinimumIntervalEnforced: true,
          nextEligibleAt: '2026-06-05T00:36:00.000Z',
          waitSeconds: 1560,
          providerFailureBackoffUntil: '2026-06-05T00:36:00.000Z',
          providerHealthState: 'degraded',
          signals: ['provider_failure_backoff', 'provider_minimum_interval_enforced'],
        },
      },
    });
    expect(queue.commands).toHaveLength(0);
    expect(outbox.all()).toHaveLength(0);
    expect(quota.reservationCount).toBe(0);
  });


});
