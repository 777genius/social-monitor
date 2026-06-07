import { buildScanStatusView } from './scan-status-view';

describe('buildScanStatusView', () => {
  it('maps scan lifecycle states to user-visible states and support actions', () => {
    expect(buildScanStatusView({ status: 'requested' })).toEqual({
      userState: 'scan_pending',
      operatorAction: 'wait_for_queue_enqueue_or_check_scheduler_lag',
    });
    expect(buildScanStatusView({ status: 'enqueued' })).toEqual({
      userState: 'scan_in_progress',
      operatorAction: 'check_worker_lag_if_status_exceeds_freshness_slo',
    });
    expect(buildScanStatusView({ status: 'succeeded' })).toEqual({
      userState: 'content_current',
      operatorAction: 'no_action_required',
    });
  });

  it('classifies failed scans without exposing raw payloads as labels', () => {
    expect(buildScanStatusView({
      status: 'failed',
      failureReason: 'Provider unavailable',
    })).toEqual({
      userState: 'scan_degraded',
      failureClass: 'provider_unavailable',
      operatorAction: 'check_provider_health_and_retry_budget',
    });
    expect(buildScanStatusView({
      status: 'failed',
      failureReason: 'upstream returned 429 rate limit',
    })).toEqual({
      userState: 'scan_degraded',
      failureClass: 'provider_rate_limited',
      operatorAction: 'reduce_scan_frequency_or_pause_affected_source',
    });
  });
});
