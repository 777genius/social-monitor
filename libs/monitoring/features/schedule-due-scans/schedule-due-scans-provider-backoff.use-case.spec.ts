import { FixedClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { ScanJob, ScanPolicy } from '../../domain';
import { SequenceIdGenerator, FakeSourceBindings, FakeScanPolicies, FakeScanQueue, FakeSchedulerDecisionHistory, makeBinding, skippedByReason, FakeScanJobs, createScheduleDueScansUseCase } from '../../../../test/support/monitoring/schedule-due-scans.fixture';

describe('schedule-due-scans provider-backoff', () => {
  it('backs off due policy when latest failed scan was provider rate limited', async () => {
    const bindings = new FakeSourceBindings();
    await bindings.save(makeBinding());
    const policies = new FakeScanPolicies();
    await policies.save(
      ScanPolicy.create({
        id: 'policy-1',
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        sourceBindingId: 'binding-1',
        intervalSeconds: 300,
        freshnessSeconds: 900,
        retryBudget: 3,
        nextRunAt: new Date('2026-06-05T11:55:00.000Z'),
        createdAt: new Date('2026-06-05T00:00:00.000Z'),
      }),
    );
    const scanJobs = new FakeScanJobs();
    await scanJobs.save(
      ScanJob.request({
        id: 'rate-limited-scan-job',
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        sourceBindingId: 'binding-1',
        scanPolicyId: 'policy-1',
        idempotencyKey: 'manual-scan-rate-limited',
        requestedAt: new Date('2026-06-05T11:57:00.000Z'),
      })
        .markEnqueued({
          enqueuedAt: new Date('2026-06-05T11:57:01.000Z'),
        })
        .markFailed({
          completedAt: new Date('2026-06-05T11:58:00.000Z'),
          failureReason: 'Provider rate limit 429',
        }),
    );
    const queue = new FakeScanQueue();
    const useCase = createScheduleDueScansUseCase(
      bindings,
      policies,
      scanJobs,
      queue,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-05T12:00:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      limit: 10,
      correlationId: 'scheduler-tick-rate-limit-backoff',
      includeDecisions: true,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        scannedAt: new Date('2026-06-05T12:00:00.000Z'),
        evaluated: 1,
        enqueued: 0,
        skipped: 1,
        skippedByReason: skippedByReason('rate_limit_backoff'),
        decisions: [
          {
            scanPolicyId: 'policy-1',
            sourceBindingId: 'binding-1',
            providerKey: 'fake-source',
            decision: 'skipped',
            reason: 'rate_limit_backoff',
            policyDueAt: new Date('2026-06-05T11:55:00.000Z'),
            nextRunAt: new Date('2026-06-05T12:03:00.000Z'),
            configuredIntervalSeconds: 300,
            effectiveIntervalSeconds: 300,
            freshnessSeconds: 900,
            providerMinimumIntervalEnforced: false,
            backoffUntil: new Date('2026-06-05T12:03:00.000Z'),
          },
        ],
      },
    });
    expect(queue.commands).toHaveLength(0);
    expect(
      (
        await policies.findBySourceBinding({
          tenantId: tenantId('tenant-1'),
          workspaceId: workspaceId('workspace-1'),
          sourceBindingId: 'binding-1',
        })
      )?.toSnapshot(),
    ).toMatchObject({
      nextRunAt: new Date('2026-06-05T12:03:00.000Z'),
    });
  });


  it('defers rate-limited source bindings until provider reset metadata plus safety buffer', async () => {
    const bindings = new FakeSourceBindings();
    await bindings.save(makeBinding('x-twitter'));
    const policies = new FakeScanPolicies();
    await policies.save(
      ScanPolicy.create({
        id: 'policy-1',
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        sourceBindingId: 'binding-1',
        intervalSeconds: 300,
        freshnessSeconds: 900,
        retryBudget: 3,
        nextRunAt: new Date('2026-06-05T11:55:00.000Z'),
        createdAt: new Date('2026-06-05T00:00:00.000Z'),
      }),
    );
    const scanJobs = new FakeScanJobs();
    await scanJobs.save(
      ScanJob.request({
        id: 'rate-limited-scan-job',
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        sourceBindingId: 'binding-1',
        scanPolicyId: 'policy-1',
        idempotencyKey: 'manual-scan-rate-limited',
        requestedAt: new Date('2026-06-05T11:57:00.000Z'),
      })
        .markEnqueued({
          enqueuedAt: new Date('2026-06-05T11:57:01.000Z'),
        })
        .markFailed({
          completedAt: new Date('2026-06-05T11:58:00.000Z'),
          failureReason: 'provider=x-twitter kind=rate_limited retryable=true message=Scweet rate limit reached',
          failureMetadata: {
            providerKey: 'x-twitter',
            kind: 'rate_limited',
            retryable: true,
            retryAfterMs: 900_000,
            rateLimitResetAt: '2026-06-05T12:15:00.000Z',
          },
        }),
    );
    const queue = new FakeScanQueue();
    const useCase = createScheduleDueScansUseCase(
      bindings,
      policies,
      scanJobs,
      queue,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-05T12:00:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      limit: 10,
      correlationId: 'scheduler-tick-rate-limit-reset-at',
      includeDecisions: true,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        scannedAt: new Date('2026-06-05T12:00:00.000Z'),
        evaluated: 1,
        enqueued: 0,
        skipped: 1,
        skippedByReason: skippedByReason('rate_limit_backoff'),
        decisions: [
          {
            scanPolicyId: 'policy-1',
            sourceBindingId: 'binding-1',
            providerKey: 'x-twitter',
            decision: 'skipped',
            reason: 'rate_limit_backoff',
            policyDueAt: new Date('2026-06-05T11:55:00.000Z'),
            nextRunAt: new Date('2026-06-05T12:15:30.000Z'),
            configuredIntervalSeconds: 300,
            effectiveIntervalSeconds: 86_400,
            freshnessSeconds: 86_400,
            providerMinimumIntervalEnforced: true,
            backoffUntil: new Date('2026-06-05T12:15:30.000Z'),
          },
        ],
      },
    });
    expect(queue.commands).toHaveLength(0);
    expect(
      (
        await policies.findBySourceBinding({
          tenantId: tenantId('tenant-1'),
          workspaceId: workspaceId('workspace-1'),
          sourceBindingId: 'binding-1',
        })
      )?.toSnapshot(),
    ).toMatchObject({
      nextRunAt: new Date('2026-06-05T12:15:30.000Z'),
    });
  });


  it('retries high-cadence provider rate limits with bounded transient backoff', async () => {
    const bindings = new FakeSourceBindings();
    await bindings.save(makeBinding('github-repo-radar'));
    const policies = new FakeScanPolicies();
    await policies.save(
      ScanPolicy.create({
        id: 'policy-1',
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        sourceBindingId: 'binding-1',
        intervalSeconds: 300,
        freshnessSeconds: 900,
        retryBudget: 3,
        nextRunAt: new Date('2026-06-05T11:55:00.000Z'),
        createdAt: new Date('2026-06-05T00:00:00.000Z'),
      }),
    );
    const scanJobs = new FakeScanJobs();
    await scanJobs.save(
      ScanJob.request({
        id: 'repo-radar-rate-limited-scan-job',
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        sourceBindingId: 'binding-1',
        scanPolicyId: 'policy-1',
        idempotencyKey: 'manual-repo-radar-rate-limited',
        requestedAt: new Date('2026-06-05T11:57:00.000Z'),
      })
        .markEnqueued({
          enqueuedAt: new Date('2026-06-05T11:57:01.000Z'),
        })
        .markFailed({
          completedAt: new Date('2026-06-05T11:58:00.000Z'),
          failureReason: 'Provider rate limit 429',
        }),
    );
    const queue = new FakeScanQueue();
    const useCase = createScheduleDueScansUseCase(
      bindings,
      policies,
      scanJobs,
      queue,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-05T12:00:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      limit: 10,
      correlationId: 'scheduler-tick-repo-radar-rate-limit-backoff',
      includeDecisions: true,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        scannedAt: new Date('2026-06-05T12:00:00.000Z'),
        evaluated: 1,
        enqueued: 0,
        skipped: 1,
        skippedByReason: skippedByReason('rate_limit_backoff'),
        decisions: [
          {
            scanPolicyId: 'policy-1',
            sourceBindingId: 'binding-1',
            providerKey: 'github-repo-radar',
            decision: 'skipped',
            reason: 'rate_limit_backoff',
            policyDueAt: new Date('2026-06-05T11:55:00.000Z'),
            nextRunAt: new Date('2026-06-05T12:13:00.000Z'),
            configuredIntervalSeconds: 300,
            effectiveIntervalSeconds: 21_600,
            freshnessSeconds: 21_600,
            providerMinimumIntervalEnforced: true,
            backoffUntil: new Date('2026-06-05T12:13:00.000Z'),
          },
        ],
      },
    });
    expect(queue.commands).toHaveLength(0);
    expect(
      (
        await policies.findBySourceBinding({
          tenantId: tenantId('tenant-1'),
          workspaceId: workspaceId('workspace-1'),
          sourceBindingId: 'binding-1',
        })
      )?.toSnapshot(),
    ).toMatchObject({
      nextRunAt: new Date('2026-06-05T12:13:00.000Z'),
    });
  });


  it('backs off due policy after repeated provider auth failures', async () => {
    const bindings = new FakeSourceBindings();
    await bindings.save(makeBinding('reddit'));
    const policies = new FakeScanPolicies();
    await policies.save(
      ScanPolicy.create({
        id: 'policy-1',
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        sourceBindingId: 'binding-1',
        intervalSeconds: 300,
        freshnessSeconds: 900,
        retryBudget: 3,
        nextRunAt: new Date('2026-06-05T11:55:00.000Z'),
        createdAt: new Date('2026-06-05T00:00:00.000Z'),
      }),
    );
    const scanJobs = new FakeScanJobs();
    for (const [id, requestedAt, completedAt] of [
      [
        'auth-failed-scan-job-2',
        '2026-06-05T11:57:00.000Z',
        '2026-06-05T11:58:00.000Z',
      ],
      [
        'auth-failed-scan-job-1',
        '2026-06-05T11:56:00.000Z',
        '2026-06-05T11:57:00.000Z',
      ],
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
    const schedulerDecisions = new FakeSchedulerDecisionHistory();
    const useCase = createScheduleDueScansUseCase(
      bindings,
      policies,
      scanJobs,
      queue,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-05T12:00:00.000Z')),
      schedulerDecisions,
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      limit: 10,
      correlationId: 'scheduler-tick-provider-failure-backoff',
      includeDecisions: true,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        scannedAt: new Date('2026-06-05T12:00:00.000Z'),
        evaluated: 1,
        enqueued: 0,
        skipped: 1,
        skippedByReason: skippedByReason('provider_failure_backoff'),
        decisions: [
          {
            scanPolicyId: 'policy-1',
            sourceBindingId: 'binding-1',
            providerKey: 'reddit',
            decision: 'skipped',
            reason: 'provider_failure_backoff',
            policyDueAt: new Date('2026-06-05T11:55:00.000Z'),
            nextRunAt: new Date('2026-06-05T12:28:00.000Z'),
            configuredIntervalSeconds: 300,
            effectiveIntervalSeconds: 900,
            freshnessSeconds: 900,
            providerMinimumIntervalEnforced: true,
            backoffUntil: new Date('2026-06-05T12:28:00.000Z'),
          },
        ],
      },
    });
    expect(queue.commands).toHaveLength(0);
    expect(
      (
        await policies.findBySourceBinding({
          tenantId: tenantId('tenant-1'),
          workspaceId: workspaceId('workspace-1'),
          sourceBindingId: 'binding-1',
        })
      )?.toSnapshot(),
    ).toMatchObject({
      nextRunAt: new Date('2026-06-05T12:28:00.000Z'),
    });
    expect(schedulerDecisions.records).toEqual([
      expect.objectContaining({
        id: 'scan-job-1',
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        decisionKey: 'scan-policy:policy-1:due-at:2026-06-05T11:55:00.000Z',
        scanPolicyId: 'policy-1',
        sourceBindingId: 'binding-1',
        providerKey: 'reddit',
        decision: 'skipped',
        reason: 'provider_failure_backoff',
        policyDueAt: new Date('2026-06-05T11:55:00.000Z'),
        evaluatedAt: new Date('2026-06-05T12:00:00.000Z'),
        nextRunAt: new Date('2026-06-05T12:28:00.000Z'),
        configuredIntervalSeconds: 300,
        effectiveIntervalSeconds: 900,
        freshnessSeconds: 900,
        providerMinimumIntervalEnforced: true,
        backoffUntil: new Date('2026-06-05T12:28:00.000Z'),
        correlationId: 'scheduler-tick-provider-failure-backoff',
        causationId: 'scheduled:policy-1:2026-06-05T11:55:00.000Z',
      }),
    ]);
  });


  it('retries high-cadence provider failures with bounded transient backoff', async () => {
    const bindings = new FakeSourceBindings();
    await bindings.save(makeBinding('github-repo-radar'));
    const policies = new FakeScanPolicies();
    await policies.save(
      ScanPolicy.create({
        id: 'policy-1',
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        sourceBindingId: 'binding-1',
        intervalSeconds: 300,
        freshnessSeconds: 900,
        retryBudget: 3,
        nextRunAt: new Date('2026-06-05T11:55:00.000Z'),
        createdAt: new Date('2026-06-05T00:00:00.000Z'),
      }),
    );
    const scanJobs = new FakeScanJobs();
    for (const [id, requestedAt, completedAt] of [
      [
        'repo-radar-unavailable-scan-job-2',
        '2026-06-05T11:57:00.000Z',
        '2026-06-05T11:58:00.000Z',
      ],
      [
        'repo-radar-unavailable-scan-job-1',
        '2026-06-05T11:56:00.000Z',
        '2026-06-05T11:57:00.000Z',
      ],
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
    const useCase = createScheduleDueScansUseCase(
      bindings,
      policies,
      scanJobs,
      queue,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-05T12:00:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      limit: 10,
      correlationId: 'scheduler-tick-repo-radar-provider-failure-backoff',
      includeDecisions: true,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        scannedAt: new Date('2026-06-05T12:00:00.000Z'),
        evaluated: 1,
        enqueued: 0,
        skipped: 1,
        skippedByReason: skippedByReason('provider_failure_backoff'),
        decisions: [
          {
            scanPolicyId: 'policy-1',
            sourceBindingId: 'binding-1',
            providerKey: 'github-repo-radar',
            decision: 'skipped',
            reason: 'provider_failure_backoff',
            policyDueAt: new Date('2026-06-05T11:55:00.000Z'),
            nextRunAt: new Date('2026-06-05T12:28:00.000Z'),
            configuredIntervalSeconds: 300,
            effectiveIntervalSeconds: 21_600,
            freshnessSeconds: 21_600,
            providerMinimumIntervalEnforced: true,
            backoffUntil: new Date('2026-06-05T12:28:00.000Z'),
          },
        ],
      },
    });
    expect(queue.commands).toHaveLength(0);
    expect(
      (
        await policies.findBySourceBinding({
          tenantId: tenantId('tenant-1'),
          workspaceId: workspaceId('workspace-1'),
          sourceBindingId: 'binding-1',
        })
      )?.toSnapshot(),
    ).toMatchObject({
      nextRunAt: new Date('2026-06-05T12:28:00.000Z'),
    });
  });


});
