import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { ScanJob } from '../../domain';
import { buildRecentWindow } from './source-binding-health-evaluation';

const makeJob = (id: string, requestedAt: Date): ScanJob => ScanJob.request({
  id,
  tenantId: tenantId('tenant-1'),
  workspaceId: workspaceId('workspace-1'),
  sourceBindingId: 'binding-1',
  scanPolicyId: 'policy-1',
  idempotencyKey: 'scan:' + id,
  requestedAt,
});

describe('source binding health history window', () => {
  it('excludes jobs outside the captured upper boundary', () => {
    const now = new Date('2026-06-16T00:10:00.000Z');
    const recent = makeJob('recent', new Date('2026-06-16T00:09:00.000Z'));
    const future = makeJob('future', new Date('2026-06-16T00:10:01.000Z'));
    const result = buildRecentWindow({ jobs: [recent, future], now });
    expect(result.totalScans).toBe(1);
    expect(result.activeScans).toBe(1);
    expect(result.windowEndedAt).toBe(now.toISOString());
  });
});
