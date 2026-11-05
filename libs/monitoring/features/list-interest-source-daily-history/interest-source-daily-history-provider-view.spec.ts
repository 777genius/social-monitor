import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { ScanJob, ScanPolicy, SourceBinding } from '../../domain';
import { buildProviderView } from './interest-source-daily-history-provider-view';

describe('provider daily history scan coverage', () => {
  it('does not count an enqueued scan as completed coverage', () => {
    const tenant = tenantId('tenant-test');
    const workspace = workspaceId('workspace-test');
    const createdAt = new Date('2026-06-24T00:00:00.000Z');
    const binding = SourceBinding.create({
      id: 'binding-test', tenantId: tenant, workspaceId: workspace,
      interestId: 'interest-test', providerKey: 'reddit',
      capabilityProfileVersion: 1, config: { query: 'reddit' }, createdAt,
    }).pause();
    const policy = ScanPolicy.create({
      id: 'policy-test', tenantId: tenant, workspaceId: workspace,
      sourceBindingId: binding.toSnapshot().id,
      intervalSeconds: 900, freshnessSeconds: 900, retryBudget: 3,
      nextRunAt: new Date('2026-06-26T10:00:00.000Z'), createdAt,
    });
    const queued = ScanJob.request({
      id: 'job-test', tenantId: tenant, workspaceId: workspace,
      sourceBindingId: binding.toSnapshot().id,
      scanPolicyId: 'policy-test', idempotencyKey: 'scan:job-test',
      requestedAt: new Date('2026-06-26T08:00:00.000Z'),
    }).markEnqueued({
      enqueuedAt: new Date('2026-06-26T08:00:01.000Z'),
    });

    const view = buildProviderView(
      'reddit',
      [binding],
      [queued],
      [],
      new Map(),
      new Map([[binding.toSnapshot().id, policy]]),
    );

    expect(view).toMatchObject({
      scannedSourceBindingCount: 0,
      unscannedSourceBindingCount: 1,
      scanCoverageState: 'none_scanned',
      signals: expect.arrayContaining(['no_scan_coverage', 'unscanned_source_bindings']),
    });
  });
});
