import { DomainError } from '@social-monitor/shared-kernel';
import { decideFailedScanDeliveryAction } from './scan-delivery-settlement-policy';

const failure = (reason: string) =>
  new DomainError('external.dependency_unavailable', reason, { reason });

describe('scan delivery settlement policy', () => {
  it('acknowledges previously recorded failure regardless of shutdown', () => {
    expect(decideFailedScanDeliveryAction(failure('scan_failure_recorded'), false))
      .toBe('acknowledge');
    expect(decideFailedScanDeliveryAction(failure('scan_failure_recorded'), true))
      .toBe('acknowledge');
  });

  it.each([
    'scan_lease_held',
    'scan_lease_release_failed',
    'scan_failure_recording_failed',
    'scan_outcome_reporting_failed',
  ])('requeues transient scan failure %s', (reason) => {
    expect(decideFailedScanDeliveryAction(failure(reason), false)).toBe('requeue');
  });

  it('requeues backpressure even without a known reason', () => {
    const error = new DomainError('operation.backpressure', 'Busy');
    expect(decideFailedScanDeliveryAction(error, false)).toBe('requeue');
  });

  it('rejects unclassified runtime errors rather than requeueing forever', () => {
    expect(decideFailedScanDeliveryAction(new Error('Malformed command'), false)).toBe('reject');
    expect(decideFailedScanDeliveryAction(failure('provider_rejected'), false)).toBe('reject');
    expect(decideFailedScanDeliveryAction(undefined, false)).toBe('reject');
  });

  it('requeues unsettled work while shutting down', () => {
    expect(decideFailedScanDeliveryAction(new Error('Interrupted'), true)).toBe('requeue');
  });
});
