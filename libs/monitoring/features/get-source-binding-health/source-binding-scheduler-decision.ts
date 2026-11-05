import type { ScanAdmissionAssessment } from '../../domain/policies/scan-admission-policy';
import {
  minimumScanIntervalSecondsForProvider,
  type EffectiveProviderScanCadence,
} from '../../domain/policies/provider-scan-cadence';
import {
  nextScanPolicyRunAfterDecision,
} from '../../domain/policies/scan-schedule-policy';
import type {
  SourceBindingHealthFreshnessView,
  SourceBindingHealthSchedulerDecisionView,
} from './get-source-binding-health.result';

export const buildSchedulerDecision = (params: {
  readonly bindingStatus: 'enabled' | 'paused';
  readonly providerKey: string;
  readonly scanPolicySnapshot?: {
    readonly intervalSeconds: number;
    readonly freshnessSeconds: number;
    readonly id: string;
    readonly nextRunAt: Date;
  };
  readonly admission?: ScanAdmissionAssessment;
  readonly freshness?: SourceBindingHealthFreshnessView;
  readonly cadence?: EffectiveProviderScanCadence;
  readonly now: Date;
}): SourceBindingHealthSchedulerDecisionView => {
  const minimumIntervalSeconds = params.cadence?.minimumIntervalSeconds ??
    minimumScanIntervalSecondsForProvider(params.providerKey);
  const base = {
    minimumIntervalSeconds,
    configuredIntervalSeconds: params.scanPolicySnapshot?.intervalSeconds,
    effectiveIntervalSeconds: params.cadence?.intervalSeconds,
    freshnessSeconds: params.cadence?.freshnessSeconds ?? params.scanPolicySnapshot?.freshnessSeconds,
    providerMinimumIntervalEnforced: params.cadence?.providerMinimumIntervalEnforced,
  };

  if (params.bindingStatus === 'paused') {
    return {
      ...base,
      canScanNow: false,
      decision: 'paused',
      reason: 'source_binding_paused',
      signals: ['source_binding_paused'],
    };
  }

  if (params.scanPolicySnapshot === undefined) {
    return {
      ...base,
      canScanNow: false,
      decision: 'not_configured',
      reason: 'scan_policy_missing',
      signals: ['scan_policy_missing'],
    };
  }

  if (params.admission?.reason === 'active_scan') {
    return {
      ...base,
      canScanNow: false,
      decision: 'active_scan',
      reason: 'scan_already_in_progress',
      signals: ['active_scan_in_progress'],
    };
  }

  if (
    params.admission?.reason === 'duplicate_window'
  ) {
    const nextEligibleAt = nextScanPolicyRunAfterDecision({
      dueAt: params.scanPolicySnapshot.nextRunAt,
      intervalSeconds: params.cadence?.intervalSeconds ?? params.scanPolicySnapshot.intervalSeconds,
      now: params.now,
      backoffUntil: null,
    }).toISOString();

    return {
      ...base,
      canScanNow: false,
      decision: 'duplicate_window',
      reason: 'scheduled_scan_window_already_recorded',
      nextEligibleAt,
      waitSeconds: secondsUntil(nextEligibleAt, params.now),
      signals: cadenceSignals('duplicate_window', params.cadence?.providerMinimumIntervalEnforced === true),
    };
  }

  if (params.admission?.reason === 'fresh_success') {
    return {
      ...base,
      canScanNow: false,
      decision: 'fresh_success',
      reason: 'latest_success_still_fresh',
      nextEligibleAt: params.freshness?.freshnessDeadlineAt,
      waitSeconds: secondsUntil(params.freshness?.freshnessDeadlineAt, params.now),
      signals: cadenceSignals('fresh_success', params.cadence?.providerMinimumIntervalEnforced === true),
    };
  }

  const rateLimitBackoff = params.admission?.rateLimitBackoff;
  if (params.admission?.reason === 'rate_limit_backoff' && rateLimitBackoff != null) {
    const backoffUntil = rateLimitBackoff.toISOString();

    return {
      ...base,
      canScanNow: false,
      decision: 'rate_limit_backoff',
      reason: 'provider_rate_limit_backoff_active',
      nextEligibleAt: backoffUntil,
      waitSeconds: secondsUntil(backoffUntil, params.now),
      rateLimitBackoffUntil: backoffUntil,
      signals: cadenceSignals('rate_limit_backoff', params.cadence?.providerMinimumIntervalEnforced === true),
    };
  }

  if (params.admission?.reason === 'provider_failure_backoff' && params.admission.providerFailureBackoff !== null) {
    const backoffUntil = params.admission.providerFailureBackoff.toISOString();

    return {
      ...base,
      canScanNow: false,
      decision: 'provider_failure_backoff',
      reason: 'provider_failure_backoff_active',
      nextEligibleAt: backoffUntil,
      waitSeconds: secondsUntil(backoffUntil, params.now),
      providerFailureBackoffUntil: backoffUntil,
      signals: cadenceSignals('provider_failure_backoff', params.cadence?.providerMinimumIntervalEnforced === true),
    };
  }

  const policyNextRunAt = params.scanPolicySnapshot.nextRunAt;
  if (policyNextRunAt.getTime() > params.now.getTime()) {
    const nextEligibleAt = policyNextRunAt.toISOString();

    return {
      ...base,
      canScanNow: false,
      decision: 'scheduled_later',
      reason: 'scan_policy_next_run_in_future',
      nextEligibleAt,
      waitSeconds: secondsUntil(nextEligibleAt, params.now),
      signals: ['scheduled_later'],
    };
  }

  return {
    ...base,
    canScanNow: true,
    decision: 'ready',
    reason: 'scan_policy_due_now',
    nextEligibleAt: params.now.toISOString(),
    waitSeconds: 0,
    signals: cadenceSignals('scan_policy_due', params.cadence?.providerMinimumIntervalEnforced === true),
  };
};

const secondsUntil = (isoDate: string | undefined, now: Date): number | undefined => {
  if (isoDate === undefined) {
    return undefined;
  }

  return Math.max(0, Math.ceil((new Date(isoDate).getTime() - now.getTime()) / 1000));
};

const cadenceSignals = (primarySignal: string, providerMinimumIntervalEnforced: boolean): readonly string[] =>
  providerMinimumIntervalEnforced
    ? [primarySignal, 'provider_minimum_interval_enforced']
    : [primarySignal];
