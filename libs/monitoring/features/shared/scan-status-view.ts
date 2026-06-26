import type { ScanJobStatus } from '../../domain';

export type ScanStatusUserState =
  | 'scan_pending'
  | 'scan_in_progress'
  | 'content_current'
  | 'scan_degraded';

export type ScanStatusFailureClass =
  | 'provider_unavailable'
  | 'provider_rate_limited'
  | 'worker_conflict'
  | 'system_failure';

export type ScanStatusView = {
  readonly userState: ScanStatusUserState;
  readonly failureClass?: ScanStatusFailureClass;
  readonly operatorAction: string;
};

export const buildScanStatusView = (params: {
  readonly status: ScanJobStatus;
  readonly failureReason?: string;
}): ScanStatusView => {
  if (params.status === 'requested') {
    return {
      userState: 'scan_pending',
      operatorAction: 'wait_for_queue_enqueue_or_check_scheduler_lag',
    };
  }

  if (params.status === 'enqueued') {
    return {
      userState: 'scan_in_progress',
      operatorAction: 'check_worker_lag_if_status_exceeds_freshness_slo',
    };
  }

  if (params.status === 'succeeded') {
    return {
      userState: 'content_current',
      operatorAction: 'no_action_required',
    };
  }

  const failureClass = classifyFailure(params.failureReason);

  return {
    userState: 'scan_degraded',
    failureClass,
    operatorAction: operatorActionFor(failureClass),
  };
};

const classifyFailure = (failureReason: string | undefined): ScanStatusFailureClass => {
  const normalized = failureReason?.toLowerCase() ?? '';

  if (normalized.includes('rate limit') || normalized.includes('429')) {
    return 'provider_rate_limited';
  }

  if (
    normalized.includes('provider') ||
    normalized.includes('unavailable') ||
    normalized.includes('auth_failed') ||
    normalized.includes('unauthorized') ||
    normalized.includes('forbidden') ||
    normalized.includes('credential') ||
    normalized.includes('401') ||
    normalized.includes('403')
  ) {
    return 'provider_unavailable';
  }

  if (normalized.includes('lease') || normalized.includes('already')) {
    return 'worker_conflict';
  }

  return 'system_failure';
};

const operatorActionFor = (failureClass: ScanStatusFailureClass): string => {
  switch (failureClass) {
    case 'provider_rate_limited':
      return 'reduce_scan_frequency_or_pause_affected_source';
    case 'provider_unavailable':
      return 'check_provider_health_and_retry_budget';
    case 'worker_conflict':
      return 'inspect_scan_lease_and_worker_lag';
    case 'system_failure':
      return 'inspect_scan_attempt_logs_and_dlq';
  }
};
