import type { ScanJob } from '../../domain';
import { summarizeScanProviderHealth } from '../shared/scan-provider-health-summary';
import type { classifySourceFailureKind } from './source-binding-health-explanation';
import type {
  SourceBindingHealthFreshnessView,
  SourceBindingHealthRecentWindowView,
  SourceBindingHealthState,
  SourceBindingProviderHealthState,
} from './get-source-binding-health.result';

const recentScanWindowMs = 24 * 60 * 60 * 1000;

export const determineHealthState = (params: {
  readonly bindingStatus: 'enabled' | 'paused';
  readonly hasScanPolicy: boolean;
  readonly latestScanStatus?: 'requested' | 'enqueued' | 'succeeded' | 'failed';
  readonly latestCollectionComplete?: boolean;
  readonly latestFailureKind?: ReturnType<typeof classifySourceFailureKind>;
  readonly freshness?: SourceBindingHealthFreshnessView;
  readonly recentProviderHealthState: SourceBindingProviderHealthState;
}): SourceBindingHealthState => {
  if (params.bindingStatus === 'paused') {
    return 'paused';
  }

  if (!params.hasScanPolicy) {
    return 'not_configured';
  }

  if (params.latestScanStatus === 'requested' || params.latestScanStatus === 'enqueued') {
    return 'scanning';
  }

  if (params.latestScanStatus === 'failed') {
    if (params.latestFailureKind === 'rate_limited') {
      return 'rate_limited';
    }
    if (params.latestFailureKind === 'auth_failed') {
      return 'auth_failed';
    }
    if (params.latestFailureKind === 'unsupported_scope') {
      return 'unsupported_scope';
    }

    return params.recentProviderHealthState === 'down' ? 'down' : 'degraded';
  }

  if (params.latestScanStatus === 'succeeded') {
    if (params.latestCollectionComplete === false) return 'degraded';
    return params.freshness?.isFresh === true ? 'healthy' : 'stale';
  }

  return 'scheduled';
};

export const buildFreshness = (params: {
  readonly completedAt: Date;
  readonly collectionComplete: boolean;
  readonly freshnessSeconds: number;
  readonly now: Date;
}): SourceBindingHealthFreshnessView => {
  const completedAtMs = params.completedAt.getTime();
  const freshnessDeadlineMs = completedAtMs + params.freshnessSeconds * 1000;
  const ageSeconds = Math.max(0, Math.floor((params.now.getTime() - completedAtMs) / 1000));
  const staleBySeconds = Math.max(0, Math.floor((params.now.getTime() - freshnessDeadlineMs) / 1000));

  return {
    isFresh: params.collectionComplete && params.now.getTime() <= freshnessDeadlineMs,
    ageSeconds,
    freshnessDeadlineAt: new Date(freshnessDeadlineMs).toISOString(),
    staleBySeconds: staleBySeconds === 0 ? undefined : staleBySeconds,
  };
};

export const buildRecentWindow = (params: {
  readonly jobs: readonly ScanJob[];
  readonly now: Date;
}): SourceBindingHealthRecentWindowView => {
  const windowStartedAt = new Date(params.now.getTime() - recentScanWindowMs);
  const recentJobs = params.jobs
    .map((job) => job.toSnapshot())
    .filter((job) =>
      job.requestedAt.getTime() >= windowStartedAt.getTime() &&
      job.requestedAt.getTime() < params.now.getTime());
  const succeededJobs = recentJobs.filter((job) => job.status === 'succeeded');
  const failedJobs = recentJobs.filter((job) => job.status === 'failed');
  const summary = summarizeScanProviderHealth(recentJobs);

  return {
    providerHealthState: summary.providerHealthState,
    windowStartedAt: windowStartedAt.toISOString(),
    windowEndedAt: params.now.toISOString(),
    totalScans: summary.totalScans,
    succeededScans: summary.succeededScans,
    failedScans: summary.failedScans,
    activeScans: summary.activeScans,
    rateLimitedScans: summary.rateLimitedScans,
    authFailedScans: summary.authFailedScans,
    providerUnavailableScans: summary.providerUnavailableScans,
    consecutiveFailures: summary.consecutiveFailures,
    lastSucceededAt: latestCompletedAt(succeededJobs),
    lastFailedAt: latestCompletedAt(failedJobs),
    operatorAction: summary.operatorAction,
    signals: summary.signals,
  };
};

const latestCompletedAt = (
  jobs: readonly { readonly completedAt?: Date }[],
): string | undefined => {
  const completed = jobs
    .flatMap((job) => job.completedAt === undefined ? [] : [job.completedAt])
    .sort((left, right) => right.getTime() - left.getTime());
  return completed[0]?.toISOString();
};


export const operatorActionForHealth = (state: SourceBindingHealthState): string => {
  switch (state) {
    case 'paused':
      return 'resume_source_binding_before_scanning';
    case 'not_configured':
      return 'create_scan_policy_for_source_binding';
    case 'scheduled':
      return 'wait_for_next_run_or_trigger_manual_scan';
    case 'scanning':
      return 'watch_scan_status_until_attempt_finishes';
    case 'healthy':
      return 'no_action_required';
    case 'stale':
      return 'trigger_manual_scan_or_reduce_scan_interval';
    case 'rate_limited':
      return 'wait_for_provider_rate_limit_backoff';
    case 'auth_failed':
      return 'refresh_or_reconnect_source_credentials';
    case 'degraded':
      return 'inspect_latest_scan_failure_and_retry_budget';
    case 'unsupported_scope':
      return 'adjust_source_query_or_requested_scopes';
    case 'down':
      return 'pause_or_backoff_provider_until_recovery';
  }
};
