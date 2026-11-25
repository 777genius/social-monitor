import { FixedClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { ScanJob, ScanPolicy, SourceBinding } from '../../domain';
import { SequenceIdGenerator, FakeSourceBindings, FakeScanPolicies, FakeScanQueue, BackpressuredScanQueue, FakeSchedulerDecisionHistory, makeBinding, makePolicy, noSkippedByReason, skippedByReason, FakeScanJobs, createScheduleDueScansUseCase } from '../../../../test/support/monitoring/schedule-due-scans.fixture';

describe('schedule-due-scans dispatch', () => {
  it('enqueues due scan policy and advances next run', async () => {
    const bindings = new FakeSourceBindings();
    await bindings.save(makeBinding());
    const policies = new FakeScanPolicies();
    await policies.save(makePolicy());
    const queue = new FakeScanQueue();
    const schedulerDecisions = new FakeSchedulerDecisionHistory();
    const useCase = createScheduleDueScansUseCase(
      bindings,
      policies,
      new FakeScanJobs(),
      queue,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-05T12:00:00.000Z')),
      schedulerDecisions,
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      limit: 10,
      correlationId: 'scheduler-tick-1',
      includeDecisions: true,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        scannedAt: new Date('2026-06-05T12:00:00.000Z'),
        evaluated: 1,
        enqueued: 1,
        skipped: 0,
        skippedByReason: noSkippedByReason(),
        decisions: [
          {
            scanPolicyId: 'policy-1',
            sourceBindingId: 'binding-1',
            providerKey: 'fake-source',
            decision: 'enqueued',
            reason: 'scan_policy_due_now',
            scanJobId: 'scan-job-1',
            policyDueAt: new Date('2026-06-05T12:00:00.000Z'),
            nextRunAt: new Date('2026-06-05T12:05:00.000Z'),
            configuredIntervalSeconds: 300,
            effectiveIntervalSeconds: 300,
            freshnessSeconds: 900,
            providerMinimumIntervalEnforced: false,
          },
        ],
      },
    });
    expect(queue.commands).toEqual([
      expect.objectContaining({
        scanJobId: 'scan-job-1',
        interestId: 'interest-1',
        sourceBindingId: 'binding-1',
        scanPolicyId: 'policy-1',
        providerKey: 'fake-source',
        sourceQuery: { mode: 'search', query: 'binding-1' },
        retryBudget: 3,
        causationId: 'scheduled:policy-1:2026-06-05T12:00:00.000Z',
      }),
    ]);
    expect(
      (
        await policies.findBySourceBinding({
          tenantId: tenantId('tenant-1'),
          workspaceId: workspaceId('workspace-1'),
          sourceBindingId: 'binding-1',
        })
      )?.toSnapshot(),
    ).toMatchObject({
      nextRunAt: new Date('2026-06-05T12:05:00.000Z'),
    });
    expect(schedulerDecisions.records).toEqual([
      expect.objectContaining({
        id: 'scan-job-2',
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        decisionKey: 'scan-policy:policy-1:due-at:2026-06-05T12:00:00.000Z',
        scanPolicyId: 'policy-1',
        sourceBindingId: 'binding-1',
        providerKey: 'fake-source',
        decision: 'enqueued',
        reason: 'scan_policy_due_now',
        scanJobId: 'scan-job-1',
        policyDueAt: new Date('2026-06-05T12:00:00.000Z'),
        evaluatedAt: new Date('2026-06-05T12:00:00.000Z'),
        nextRunAt: new Date('2026-06-05T12:05:00.000Z'),
        configuredIntervalSeconds: 300,
        effectiveIntervalSeconds: 300,
        freshnessSeconds: 900,
        providerMinimumIntervalEnforced: false,
        correlationId: 'scheduler-tick-1',
        causationId: 'scheduled:policy-1:2026-06-05T12:00:00.000Z',
      }),
    ]);
  });


  it('fast-forwards stale due policies after scheduler downtime', async () => {
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
        nextRunAt: new Date('2026-06-05T10:00:00.000Z'),
        createdAt: new Date('2026-06-05T00:00:00.000Z'),
      }),
    );
    const queue = new FakeScanQueue();
    const useCase = createScheduleDueScansUseCase(
      bindings,
      policies,
      new FakeScanJobs(),
      queue,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-05T12:00:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      limit: 10,
      correlationId: 'scheduler-tick-after-downtime',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        scannedAt: new Date('2026-06-05T12:00:00.000Z'),
        evaluated: 1,
        enqueued: 1,
        skipped: 0,
        skippedByReason: noSkippedByReason(),
      },
    });
    expect(queue.commands).toHaveLength(1);
    expect(
      (
        await policies.findBySourceBinding({
          tenantId: tenantId('tenant-1'),
          workspaceId: workspaceId('workspace-1'),
          sourceBindingId: 'binding-1',
        })
      )?.toSnapshot(),
    ).toMatchObject({
      nextRunAt: new Date('2026-06-05T12:05:00.000Z'),
    });
  });


  it('advances legacy too-aggressive policies by provider minimum cadence after enqueue', async () => {
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
        nextRunAt: new Date('2026-06-05T12:00:00.000Z'),
        createdAt: new Date('2026-06-05T00:00:00.000Z'),
      }),
    );
    const queue = new FakeScanQueue();
    const useCase = createScheduleDueScansUseCase(
      bindings,
      policies,
      new FakeScanJobs(),
      queue,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-05T12:00:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      limit: 10,
      correlationId: 'scheduler-tick-provider-minimum-enqueue',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        scannedAt: new Date('2026-06-05T12:00:00.000Z'),
        evaluated: 1,
        enqueued: 1,
        skipped: 0,
        skippedByReason: noSkippedByReason(),
      },
    });
    expect(queue.commands).toEqual([
      expect.objectContaining({
        providerKey: 'reddit',
        causationId: 'scheduled:policy-1:2026-06-05T12:00:00.000Z',
      }),
    ]);
    expect(
      (
        await policies.findBySourceBinding({
          tenantId: tenantId('tenant-1'),
          workspaceId: workspaceId('workspace-1'),
          sourceBindingId: 'binding-1',
        })
      )?.toSnapshot(),
    ).toMatchObject({
      nextRunAt: new Date('2026-06-05T12:15:00.000Z'),
    });
  });


  it('enqueues daily GitHub repo radar scans with configured discovery query', async () => {
    const bindings = new FakeSourceBindings();
    await bindings.save(
      SourceBinding.create({
        id: 'repo-radar-binding-1',
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        interestId: 'interest-repo-radar',
        providerKey: 'github-repo-radar',
        capabilityProfileVersion: 1,
        config: {
          query: 'agent tooling',
          topics: ['ai', 'agents'],
          languages: ['TypeScript'],
        },
        createdAt: new Date('2026-06-05T00:00:00.000Z'),
      }),
    );
    const policies = new FakeScanPolicies();
    await policies.save(
      ScanPolicy.create({
        id: 'repo-radar-daily-policy',
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        sourceBindingId: 'repo-radar-binding-1',
        intervalSeconds: 86_400,
        freshnessSeconds: 86_400,
        retryBudget: 3,
        nextRunAt: new Date('2026-06-05T12:00:00.000Z'),
        createdAt: new Date('2026-06-05T00:00:00.000Z'),
      }),
    );
    const queue = new FakeScanQueue();
    const useCase = createScheduleDueScansUseCase(
      bindings,
      policies,
      new FakeScanJobs(),
      queue,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-05T12:00:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      limit: 10,
      correlationId: 'scheduler-tick-repo-radar-daily',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        scannedAt: new Date('2026-06-05T12:00:00.000Z'),
        evaluated: 1,
        enqueued: 1,
        skipped: 0,
        skippedByReason: noSkippedByReason(),
      },
    });
    expect(queue.commands).toEqual([
      expect.objectContaining({
        interestId: 'interest-repo-radar',
        sourceBindingId: 'repo-radar-binding-1',
        scanPolicyId: 'repo-radar-daily-policy',
        providerKey: 'github-repo-radar',
        sourceQuery: { mode: 'search', query: 'agent tooling' },
        retryBudget: 3,
        causationId:
          'scheduled:repo-radar-daily-policy:2026-06-05T12:00:00.000Z',
      }),
    ]);
    expect(
      (
        await policies.findBySourceBinding({
          tenantId: tenantId('tenant-1'),
          workspaceId: workspaceId('workspace-1'),
          sourceBindingId: 'repo-radar-binding-1',
        })
      )?.toSnapshot(),
    ).toMatchObject({
      nextRunAt: new Date('2026-06-06T12:00:00.000Z'),
    });
  });


  it('does not enqueue a policy before next run is due', async () => {
    const bindings = new FakeSourceBindings();
    await bindings.save(makeBinding());
    const policies = new FakeScanPolicies();
    await policies.save(makePolicy());
    const queue = new FakeScanQueue();
    const useCase = createScheduleDueScansUseCase(
      bindings,
      policies,
      new FakeScanJobs(),
      queue,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-05T11:59:59.000Z')),
    );

    const result = await useCase.execute({
      limit: 10,
      correlationId: 'scheduler-tick-before-due',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        scannedAt: new Date('2026-06-05T11:59:59.000Z'),
        evaluated: 0,
        enqueued: 0,
        skipped: 0,
        skippedByReason: noSkippedByReason(),
      },
    });
    expect(queue.commands).toHaveLength(0);
  });


  it('skips due policy when source binding already has active scan job', async () => {
    const bindings = new FakeSourceBindings();
    await bindings.save(makeBinding());
    const policies = new FakeScanPolicies();
    await policies.save(makePolicy());
    const scanJobs = new FakeScanJobs();
    await scanJobs.save(
      ScanJob.request({
        id: 'active-scan-job',
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        sourceBindingId: 'binding-1',
        scanPolicyId: 'policy-1',
        idempotencyKey: 'manual-scan-active',
        requestedAt: new Date('2026-06-05T11:59:00.000Z'),
      }).markEnqueued({
        enqueuedAt: new Date('2026-06-05T11:59:01.000Z'),
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
      correlationId: 'scheduler-tick-active-scan',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        scannedAt: new Date('2026-06-05T12:00:00.000Z'),
        evaluated: 1,
        enqueued: 0,
        skipped: 1,
        skippedByReason: skippedByReason('active_scan'),
      },
    });
    expect(queue.commands).toHaveLength(0);
  });


  it('skips due policy when scheduled idempotency window already exists', async () => {
    const bindings = new FakeSourceBindings();
    await bindings.save(makeBinding());
    const policies = new FakeScanPolicies();
    await policies.save(makePolicy());
    const scanJobs = new FakeScanJobs();
    await scanJobs.save(
      ScanJob.request({
        id: 'duplicate-window-scan-job',
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        sourceBindingId: 'binding-1',
        scanPolicyId: 'policy-1',
        idempotencyKey: 'scheduled:policy-1:2026-06-05T12:00:00.000Z',
        requestedAt: new Date('2026-06-05T11:50:00.000Z'),
      })
        .markEnqueued({
          enqueuedAt: new Date('2026-06-05T11:50:01.000Z'),
        })
        .markFailed({
          completedAt: new Date('2026-06-05T11:51:00.000Z'),
          failureReason: 'Provider rejected malformed query',
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
      correlationId: 'scheduler-tick-duplicate-window',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        scannedAt: new Date('2026-06-05T12:00:00.000Z'),
        evaluated: 1,
        enqueued: 0,
        skipped: 1,
        skippedByReason: skippedByReason('duplicate_window'),
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
      nextRunAt: new Date('2026-06-05T12:05:00.000Z'),
    });
  });


  it('skips due policy and advances next run when source binding is paused', async () => {
    const bindings = new FakeSourceBindings();
    await bindings.save(makeBinding('reddit').pause());
    const policies = new FakeScanPolicies();
    await policies.save(makePolicy());
    const scanJobs = new FakeScanJobs();
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
      correlationId: 'scheduler-tick-paused-binding',
      includeDecisions: true,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        scannedAt: new Date('2026-06-05T12:00:00.000Z'),
        evaluated: 1,
        enqueued: 0,
        skipped: 1,
        skippedByReason: skippedByReason('source_unavailable'),
        decisions: [
          {
            scanPolicyId: 'policy-1',
            sourceBindingId: 'binding-1',
            providerKey: 'reddit',
            decision: 'skipped',
            reason: 'source_unavailable',
            policyDueAt: new Date('2026-06-05T12:00:00.000Z'),
            nextRunAt: new Date('2026-06-05T12:15:00.000Z'),
            configuredIntervalSeconds: 300,
            effectiveIntervalSeconds: 900,
            freshnessSeconds: 900,
            providerMinimumIntervalEnforced: true,
          },
        ],
      },
    });
    await expect(
      scanJobs.findByIdempotencyKey({
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        idempotencyKey: 'scheduled:policy-1:2026-06-05T12:00:00.000Z',
      }),
    ).resolves.toBeNull();
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
      nextRunAt: new Date('2026-06-05T12:15:00.000Z'),
    });
  });


  it('skips due policy and advances next run when queue is backpressured', async () => {
    const bindings = new FakeSourceBindings();
    await bindings.save(makeBinding());
    const policies = new FakeScanPolicies();
    await policies.save(makePolicy());
    const scanJobs = new FakeScanJobs();
    const queue = new BackpressuredScanQueue();
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
      correlationId: 'scheduler-tick-backpressure',
      includeDecisions: true,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        scannedAt: new Date('2026-06-05T12:00:00.000Z'),
        evaluated: 1,
        enqueued: 0,
        skipped: 1,
        skippedByReason: skippedByReason('queue_backpressure'),
        decisions: [
          {
            scanPolicyId: 'policy-1',
            sourceBindingId: 'binding-1',
            providerKey: 'fake-source',
            decision: 'skipped',
            reason: 'queue_backpressure',
            policyDueAt: new Date('2026-06-05T12:00:00.000Z'),
            nextRunAt: new Date('2026-06-05T12:01:00.000Z'),
            configuredIntervalSeconds: 300,
            effectiveIntervalSeconds: 300,
            freshnessSeconds: 900,
            providerMinimumIntervalEnforced: false,
          },
        ],
      },
    });
    await expect(
      scanJobs.findByIdempotencyKey({
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        idempotencyKey: 'scheduled:policy-1:2026-06-05T12:00:00.000Z',
      }),
    ).resolves.toBeNull();
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
      nextRunAt: new Date('2026-06-05T12:01:00.000Z'),
    });
  });


  it('retries queue backpressure quickly even for high-cadence providers', async () => {
    const bindings = new FakeSourceBindings();
    await bindings.save(makeBinding('github-repo-radar'));
    const policies = new FakeScanPolicies();
    await policies.save(makePolicy());
    const scanJobs = new FakeScanJobs();
    const queue = new BackpressuredScanQueue();
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
      correlationId: 'scheduler-tick-backpressure-repo-radar',
      includeDecisions: true,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        scannedAt: new Date('2026-06-05T12:00:00.000Z'),
        evaluated: 1,
        enqueued: 0,
        skipped: 1,
        skippedByReason: skippedByReason('queue_backpressure'),
        decisions: [
          expect.objectContaining({
            scanPolicyId: 'policy-1',
            sourceBindingId: 'binding-1',
            providerKey: 'github-repo-radar',
            decision: 'skipped',
            reason: 'queue_backpressure',
            policyDueAt: new Date('2026-06-05T12:00:00.000Z'),
            nextRunAt: new Date('2026-06-05T12:01:00.000Z'),
            configuredIntervalSeconds: 300,
            effectiveIntervalSeconds: 21_600,
            freshnessSeconds: 21_600,
            providerMinimumIntervalEnforced: true,
          }),
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
      nextRunAt: new Date('2026-06-05T12:01:00.000Z'),
    });
  });


  it('keeps global scheduler decisions tenant-scoped across workspaces', async () => {
    const firstTenant = tenantId('tenant-global-scheduler-a');
    const firstWorkspace = workspaceId('workspace-global-scheduler-a');
    const secondTenant = tenantId('tenant-global-scheduler-b');
    const secondWorkspace = workspaceId('workspace-global-scheduler-b');
    const bindings = new FakeSourceBindings();
    await bindings.save(
      SourceBinding.create({
        id: 'binding-global-a',
        tenantId: firstTenant,
        workspaceId: firstWorkspace,
        interestId: 'interest-global-a',
        providerKey: 'rss',
        capabilityProfileVersion: 1,
        config: { feedUrl: 'https://example.test/a.xml' },
        createdAt: new Date('2026-06-05T00:00:00.000Z'),
      }),
    );
    await bindings.save(
      SourceBinding.create({
        id: 'binding-global-b',
        tenantId: secondTenant,
        workspaceId: secondWorkspace,
        interestId: 'interest-global-b',
        providerKey: 'reddit',
        capabilityProfileVersion: 1,
        config: { subreddit: 'programming', listing: 'hot' },
        createdAt: new Date('2026-06-05T00:00:00.000Z'),
      }),
    );
    const policies = new FakeScanPolicies();
    await policies.save(
      ScanPolicy.create({
        id: 'policy-global-a',
        tenantId: firstTenant,
        workspaceId: firstWorkspace,
        sourceBindingId: 'binding-global-a',
        intervalSeconds: 300,
        freshnessSeconds: 900,
        retryBudget: 2,
        nextRunAt: new Date('2026-06-05T12:00:00.000Z'),
        createdAt: new Date('2026-06-05T00:00:00.000Z'),
      }),
    );
    await policies.save(
      ScanPolicy.create({
        id: 'policy-global-b',
        tenantId: secondTenant,
        workspaceId: secondWorkspace,
        sourceBindingId: 'binding-global-b',
        intervalSeconds: 900,
        freshnessSeconds: 900,
        retryBudget: 1,
        nextRunAt: new Date('2026-06-05T12:00:00.000Z'),
        createdAt: new Date('2026-06-05T00:00:00.000Z'),
      }),
    );
    const queue = new FakeScanQueue();
    const schedulerDecisions = new FakeSchedulerDecisionHistory();
    const useCase = createScheduleDueScansUseCase(
      bindings,
      policies,
      new FakeScanJobs(),
      queue,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-05T12:00:00.000Z')),
      schedulerDecisions,
    );

    const result = await useCase.execute({
      limit: 10,
      correlationId: 'scheduler-global-tick',
      includeDecisions: true,
    });

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        evaluated: 2,
        enqueued: 2,
        skipped: 0,
        skippedByReason: noSkippedByReason(),
        decisions: [
          expect.objectContaining({
            scanPolicyId: 'policy-global-a',
            sourceBindingId: 'binding-global-a',
            providerKey: 'rss',
            decision: 'enqueued',
            reason: 'scan_policy_due_now',
          }),
          expect.objectContaining({
            scanPolicyId: 'policy-global-b',
            sourceBindingId: 'binding-global-b',
            providerKey: 'reddit',
            decision: 'enqueued',
            reason: 'scan_policy_due_now',
            effectiveIntervalSeconds: 900,
            providerMinimumIntervalEnforced: false,
          }),
        ],
      }),
    });
    expect(queue.commands).toEqual([
      expect.objectContaining({
        tenantId: firstTenant,
        workspaceId: firstWorkspace,
        sourceBindingId: 'binding-global-a',
        scanPolicyId: 'policy-global-a',
        providerKey: 'rss',
      }),
      expect.objectContaining({
        tenantId: secondTenant,
        workspaceId: secondWorkspace,
        sourceBindingId: 'binding-global-b',
        scanPolicyId: 'policy-global-b',
        providerKey: 'reddit',
      }),
    ]);
    expect(schedulerDecisions.records).toEqual([
      expect.objectContaining({
        tenantId: firstTenant,
        workspaceId: firstWorkspace,
        decisionKey:
          'scan-policy:policy-global-a:due-at:2026-06-05T12:00:00.000Z',
        sourceBindingId: 'binding-global-a',
        providerKey: 'rss',
        correlationId: 'scheduler-global-tick',
      }),
      expect.objectContaining({
        tenantId: secondTenant,
        workspaceId: secondWorkspace,
        decisionKey:
          'scan-policy:policy-global-b:due-at:2026-06-05T12:00:00.000Z',
        sourceBindingId: 'binding-global-b',
        providerKey: 'reddit',
        correlationId: 'scheduler-global-tick',
      }),
    ]);
    await expect(
      policies.findBySourceBinding({
        tenantId: firstTenant,
        workspaceId: firstWorkspace,
        sourceBindingId: 'binding-global-b',
      }),
    ).resolves.toBeNull();
  });


  it('rejects unsafe scheduler batch size', async () => {
    const useCase = createScheduleDueScansUseCase(
      new FakeSourceBindings(),
      new FakeScanPolicies(),
      new FakeScanJobs(),
      new FakeScanQueue(),
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-05T12:00:00.000Z')),
    );

    const result = await useCase.execute({
      limit: 0,
      correlationId: 'scheduler-tick-invalid',
    });

    expect(result.ok).toBe(false);
  });
});
