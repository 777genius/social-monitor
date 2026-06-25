import type { ScanJobStatus } from '../../domain';
import { buildScanStatusView } from './scan-status-view';

export type ScanProviderHealthState =
  | 'unknown'
  | 'operational'
  | 'degraded'
  | 'down';

export type ScanProviderHealthInput = {
  readonly status: ScanJobStatus;
  readonly failureReason?: string;
};

export type ScanProviderHealthSummary = {
  readonly providerHealthState: ScanProviderHealthState;
  readonly totalScans: number;
  readonly succeededScans: number;
  readonly failedScans: number;
  readonly activeScans: number;
  readonly rateLimitedScans: number;
  readonly providerUnavailableScans: number;
  readonly consecutiveFailures: number;
  readonly operatorAction: string;
  readonly signals: readonly string[];
};

export const summarizeScanProviderHealth = (
  jobs: readonly ScanProviderHealthInput[],
): ScanProviderHealthSummary => {
  const failedJobs = jobs.filter((job) => job.status === 'failed');
  const succeededJobs = jobs.filter((job) => job.status === 'succeeded');
  const activeJobs = jobs.filter((job) => job.status === 'requested' || job.status === 'enqueued');
  const failureClasses = failedJobs.map((job) =>
    buildScanStatusView({
      status: job.status,
      failureReason: job.failureReason,
    }).failureClass,
  );
  const rateLimitedScans = failureClasses.filter((failureClass) => failureClass === 'provider_rate_limited').length;
  const providerUnavailableScans =
    failureClasses.filter((failureClass) => failureClass === 'provider_unavailable').length;
  const consecutiveFailures = countConsecutiveCompletedFailures(jobs);
  const providerHealthState = providerHealthStateFor({
    totalScans: jobs.length,
    failedScans: failedJobs.length,
    succeededScans: succeededJobs.length,
    activeScans: activeJobs.length,
    consecutiveFailures,
    providerUnavailableScans,
  });

  return {
    providerHealthState,
    totalScans: jobs.length,
    succeededScans: succeededJobs.length,
    failedScans: failedJobs.length,
    activeScans: activeJobs.length,
    rateLimitedScans,
    providerUnavailableScans,
    consecutiveFailures,
    operatorAction: operatorActionForProviderHealth(providerHealthState),
    signals: scanProviderHealthSignals({
      totalScans: jobs.length,
      succeededScans: succeededJobs.length,
      failedScans: failedJobs.length,
      activeScans: activeJobs.length,
      rateLimitedScans,
      providerUnavailableScans,
      consecutiveFailures,
    }),
  };
};

const countConsecutiveCompletedFailures = (
  jobs: readonly { readonly status: ScanJobStatus }[],
): number => {
  let count = 0;

  for (const job of jobs) {
    if (job.status === 'requested' || job.status === 'enqueued') {
      continue;
    }

    if (job.status !== 'failed') {
      break;
    }

    count += 1;
  }

  return count;
};

const providerHealthStateFor = (params: {
  readonly totalScans: number;
  readonly failedScans: number;
  readonly succeededScans: number;
  readonly activeScans: number;
  readonly consecutiveFailures: number;
  readonly providerUnavailableScans: number;
}): ScanProviderHealthState => {
  if (params.totalScans === 0) {
    return 'unknown';
  }

  if (params.consecutiveFailures >= 3 || params.providerUnavailableScans >= 3) {
    return 'down';
  }

  if (params.failedScans > 0) {
    return 'degraded';
  }

  if (params.succeededScans > 0) {
    return 'operational';
  }

  return params.activeScans > 0 ? 'unknown' : 'degraded';
};

const operatorActionForProviderHealth = (
  state: ScanProviderHealthState,
): string => {
  switch (state) {
    case 'unknown':
      return 'wait_for_next_scan_or_trigger_manual_scan';
    case 'operational':
      return 'no_action_required';
    case 'degraded':
      return 'inspect_recent_scan_failures_and_rate_limits';
    case 'down':
      return 'pause_or_backoff_provider_until_recovery';
  }
};

const scanProviderHealthSignals = (params: {
  readonly totalScans: number;
  readonly succeededScans: number;
  readonly failedScans: number;
  readonly activeScans: number;
  readonly rateLimitedScans: number;
  readonly providerUnavailableScans: number;
  readonly consecutiveFailures: number;
}): readonly string[] => {
  const signals: string[] = [];

  if (params.totalScans === 0) {
    signals.push('no_recent_scans');
  }
  if (params.succeededScans > 0) {
    signals.push('recent_success');
  }
  if (params.failedScans > 0) {
    signals.push('recent_failure');
  }
  if (params.activeScans > 0) {
    signals.push('active_scan_in_progress');
  }
  if (params.rateLimitedScans > 0) {
    signals.push('rate_limited');
  }
  if (params.providerUnavailableScans > 0) {
    signals.push('provider_unavailable');
  }
  if (params.consecutiveFailures >= 2) {
    signals.push('consecutive_failures');
  }

  return signals;
};
