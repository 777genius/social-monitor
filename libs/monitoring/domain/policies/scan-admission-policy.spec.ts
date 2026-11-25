import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import type { ScanJobProps } from '../entities/scan-job';
import { evaluateManualScanAdmission, evaluateScheduledScanAdmission } from './scan-admission-policy';
import { effectiveProviderScanCadence } from './provider-scan-cadence';

const completedAt = new Date('2026-06-16T03:00:00Z');
const cadence = effectiveProviderScanCadence({ providerKey: 'fake-source', intervalSeconds: 300, freshnessSeconds: 900 });
const job = (changes: Partial<ScanJobProps> = {}): ScanJobProps => ({
  tenantId: tenantId('sandbox-tenant'), workspaceId: workspaceId('sandbox-workspace'),
  id: 'scan', sourceBindingId: 'binding', scanPolicyId: 'policy', idempotencyKey: 'request',
  requestedAt: completedAt, completedAt, status: 'succeeded', ...changes,
});

describe('scan admission shared business contract', () => {
  it.each([
    { name: 'exact freshness deadline', latest: job(), now: '03:15:00', expected: 'fresh_success' },
    { name: 'after freshness deadline', latest: job(), now: '03:15:01', expected: null },
    { name: 'incomplete success', latest: job({ executionMetadata: { collectionComplete: false } }), now: '03:01:00', expected: null },
    { name: 'rate limit before expiry', latest: job({ status: 'failed', failureMetadata: { kind: 'rate_limited' } }), now: '03:04:59', expected: 'rate_limit_backoff' },
    { name: 'rate limit exact expiry', latest: job({ status: 'failed', failureMetadata: { kind: 'rate_limited' } }), now: '03:05:00', expected: null },
    { name: 'metadata overrides misleading auth text', latest: job({ status: 'failed', failureMetadata: { kind: 'rate_limited' }, failureReason: 'unauthorized' }), now: '03:01:00', expected: 'rate_limit_backoff' },
  ])('preserves manual/scheduled parity for $name', ({ latest, now, expected }) => {
    const facts = { activeScan: false, latestJob: latest, recentJobs: [latest], cadence,
      now: new Date(`2026-06-16T${now}Z`) };
    const manual = evaluateManualScanAdmission(facts);
    expect(manual.reason).toBe(expected);
    expect(evaluateScheduledScanAdmission({ ...facts, duplicateWindow: false })).toEqual(manual);
  });

  it('keeps active overlap above scheduled duplicates and duplicates above freshness', () => {
    const latest = job();
    const facts = { activeScan: true, latestJob: latest, recentJobs: [latest], cadence, now: completedAt };
    expect(evaluateScheduledScanAdmission({ ...facts, duplicateWindow: true }).reason).toBe('active_scan');
    expect(evaluateScheduledScanAdmission({ ...facts, activeScan: false, duplicateWindow: true }).reason).toBe('duplicate_window');
    expect(evaluateManualScanAdmission({ ...facts, activeScan: false }).reason).toBe('fresh_success');
  });

  it('keeps caller history intact for provider backoff and treats its deadline as eligible', () => {
    const failure = job({ status: 'failed', failureMetadata: { kind: 'auth_failed' } });
    const active = job({ status: 'enqueued', completedAt: undefined });
    const facts = { activeScan: false, latestJob: failure,
      recentJobs: [active, active, active, active, failure, failure], cadence,
      now: new Date('2026-06-16T03:09:59Z') };
    expect(evaluateManualScanAdmission({ ...facts, recentJobs: facts.recentJobs.slice(0, 5) }).reason).toBeNull();
    expect(evaluateScheduledScanAdmission({ ...facts, duplicateWindow: false }).reason).toBe('provider_failure_backoff');
    expect(evaluateManualScanAdmission({ ...facts, now: new Date('2026-06-16T03:10:00Z') }).reason).toBeNull();
  });
});
