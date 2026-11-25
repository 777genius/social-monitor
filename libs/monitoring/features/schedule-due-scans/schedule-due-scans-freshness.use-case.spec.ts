import { FixedClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { ScanJob, ScanPolicy, SourceBinding } from '../../domain';
import { SequenceIdGenerator, FakeSourceBindings, FakeScanPolicies, FakeScanQueue, makeBinding, makePolicy, skippedByReason, FakeScanJobs, createScheduleDueScansUseCase } from '../../../../test/support/monitoring/schedule-due-scans.fixture';

describe('schedule-due-scans freshness', () => {
  it('uses provider minimum cadence when skipping recently scanned legacy policy', async () => {
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
    const scanJobs = new FakeScanJobs();
    await scanJobs.save(
      ScanJob.request({
        id: 'recent-reddit-scan-job',
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        sourceBindingId: 'binding-1',
        scanPolicyId: 'policy-1',
        idempotencyKey: 'manual-recent-reddit-scan',
        requestedAt: new Date('2026-06-05T11:54:00.000Z'),
      })
        .markEnqueued({
          enqueuedAt: new Date('2026-06-05T11:54:01.000Z'),
        })
        .markSucceeded({
          completedAt: new Date('2026-06-05T11:55:00.000Z'),
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
      correlationId: 'scheduler-tick-provider-minimum-fresh-skip',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        scannedAt: new Date('2026-06-05T12:00:00.000Z'),
        evaluated: 1,
        enqueued: 0,
        skipped: 1,
        skippedByReason: skippedByReason('fresh_success'),
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
      nextRunAt: new Date('2026-06-05T12:15:00.000Z'),
    });
  });


  it('does not shorten daily provider cadence when a successful scan is still fresh', async () => {
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
    const scanJobs = new FakeScanJobs();
    await scanJobs.save(
      ScanJob.request({
        id: 'fresh-repo-radar-scan-job',
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        sourceBindingId: 'repo-radar-binding-1',
        scanPolicyId: 'repo-radar-daily-policy',
        idempotencyKey: 'manual-fresh-repo-radar',
        requestedAt: new Date('2026-06-05T11:54:00.000Z'),
      })
        .markEnqueued({
          enqueuedAt: new Date('2026-06-05T11:54:01.000Z'),
        })
        .markSucceeded({
          completedAt: new Date('2026-06-05T11:55:00.000Z'),
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
      correlationId: 'scheduler-tick-repo-radar-fresh-daily',
      includeDecisions: true,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        scannedAt: new Date('2026-06-05T12:00:00.000Z'),
        evaluated: 1,
        enqueued: 0,
        skipped: 1,
        skippedByReason: skippedByReason('fresh_success'),
        decisions: [
          {
            scanPolicyId: 'repo-radar-daily-policy',
            sourceBindingId: 'repo-radar-binding-1',
            providerKey: 'github-repo-radar',
            decision: 'skipped',
            reason: 'fresh_success',
            policyDueAt: new Date('2026-06-05T12:00:00.000Z'),
            nextRunAt: new Date('2026-06-06T12:00:00.000Z'),
            configuredIntervalSeconds: 86_400,
            effectiveIntervalSeconds: 86_400,
            freshnessSeconds: 86_400,
            providerMinimumIntervalEnforced: false,
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
          sourceBindingId: 'repo-radar-binding-1',
        })
      )?.toSnapshot(),
    ).toMatchObject({
      nextRunAt: new Date('2026-06-06T12:00:00.000Z'),
    });
  });


  it('skips due policy and advances next run when latest successful scan is still fresh', async () => {
    const bindings = new FakeSourceBindings();
    await bindings.save(makeBinding());
    const policies = new FakeScanPolicies();
    await policies.save(makePolicy());
    const scanJobs = new FakeScanJobs();
    await scanJobs.save(
      ScanJob.request({
        id: 'fresh-completed-scan-job',
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        sourceBindingId: 'binding-1',
        scanPolicyId: 'policy-1',
        idempotencyKey: 'manual-scan-fresh',
        requestedAt: new Date('2026-06-05T11:54:00.000Z'),
      })
        .markEnqueued({
          enqueuedAt: new Date('2026-06-05T11:54:01.000Z'),
        })
        .markSucceeded({
          completedAt: new Date('2026-06-05T11:55:00.000Z'),
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
      correlationId: 'scheduler-tick-fresh-scan',
      includeDecisions: true,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        scannedAt: new Date('2026-06-05T12:00:00.000Z'),
        evaluated: 1,
        enqueued: 0,
        skipped: 1,
        skippedByReason: skippedByReason('fresh_success'),
        decisions: [
          {
            scanPolicyId: 'policy-1',
            sourceBindingId: 'binding-1',
            providerKey: 'fake-source',
            decision: 'skipped',
            reason: 'fresh_success',
            policyDueAt: new Date('2026-06-05T12:00:00.000Z'),
            nextRunAt: new Date('2026-06-05T12:10:00.000Z'),
            configuredIntervalSeconds: 300,
            effectiveIntervalSeconds: 300,
            freshnessSeconds: 900,
            providerMinimumIntervalEnforced: false,
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
      nextRunAt: new Date('2026-06-05T12:10:00.000Z'),
    });
  });


  it('treats the exact freshness deadline as still fresh for scheduled scans', async () => {
    const bindings = new FakeSourceBindings();
    await bindings.save(makeBinding());
    const policies = new FakeScanPolicies();
    await policies.save(makePolicy());
    const scanJobs = new FakeScanJobs();
    await scanJobs.save(
      ScanJob.request({
        id: 'fresh-boundary-completed-scan-job',
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        sourceBindingId: 'binding-1',
        scanPolicyId: 'policy-1',
        idempotencyKey: 'manual-scan-fresh-boundary',
        requestedAt: new Date('2026-06-05T11:44:00.000Z'),
      })
        .markEnqueued({
          enqueuedAt: new Date('2026-06-05T11:44:01.000Z'),
        })
        .markSucceeded({
          completedAt: new Date('2026-06-05T11:45:00.000Z'),
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
      correlationId: 'scheduler-tick-fresh-boundary',
      includeDecisions: true,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        scannedAt: new Date('2026-06-05T12:00:00.000Z'),
        evaluated: 1,
        enqueued: 0,
        skipped: 1,
        skippedByReason: skippedByReason('fresh_success'),
        decisions: [
          expect.objectContaining({
            scanPolicyId: 'policy-1',
            sourceBindingId: 'binding-1',
            providerKey: 'fake-source',
            decision: 'skipped',
            reason: 'fresh_success',
            policyDueAt: new Date('2026-06-05T12:00:00.000Z'),
            nextRunAt: new Date('2026-06-05T12:05:00.000Z'),
            freshnessSeconds: 900,
          }),
        ],
      },
    });
    expect(queue.commands).toHaveLength(0);
    await expect(
      scanJobs.findByIdempotencyKey({
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        idempotencyKey: 'scheduled:policy-1:2026-06-05T12:00:00.000Z',
      }),
    ).resolves.toBeNull();
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


});
