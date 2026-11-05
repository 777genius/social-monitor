import type { EffectiveProviderScanCadence } from '../../domain/policies/provider-scan-cadence';
import type { ScanAdmissionAssessment } from '../../domain/policies/scan-admission-policy';
import type { ScanProviderHealthState } from '../shared/scan-provider-health-summary';
import type { RequestScanDecisionView } from './request-scan.result';

export const idempotentReplayDecision = (): RequestScanDecisionView => ({
  decision: 'idempotent_replay', reason: 'idempotency_key_reused',
  createdNewScan: false, signals: ['idempotent_replay'],
});

export const cadenceDecisionFields = (
  policy: { readonly intervalSeconds: number },
  cadence: EffectiveProviderScanCadence,
) => ({
  minimumIntervalSeconds: cadence.minimumIntervalSeconds,
  configuredIntervalSeconds: policy.intervalSeconds,
  effectiveIntervalSeconds: cadence.intervalSeconds,
  freshnessSeconds: cadence.freshnessSeconds,
  providerMinimumIntervalEnforced: cadence.providerMinimumIntervalEnforced,
});

export const presentSuppressedScanRequest = (params: {
  readonly admission: ScanAdmissionAssessment;
  readonly cadence: EffectiveProviderScanCadence;
  readonly configuredIntervalSeconds: number;
  readonly providerHealthState: ScanProviderHealthState;
  readonly now: Date;
}): RequestScanDecisionView | null => {
  const { admission, cadence } = params;
  const decision = admission.reason;
  if (decision !== 'fresh_success' && decision !== 'rate_limit_backoff' &&
      decision !== 'provider_failure_backoff') return null;
  const deadline = decision === 'fresh_success' ? admission.freshnessDeadlineAt
    : decision === 'rate_limit_backoff' ? admission.rateLimitBackoff
    : admission.providerFailureBackoff;
  const nextEligibleAt = deadline?.toISOString();
  const reason = decision === 'fresh_success' ? 'latest_success_still_fresh'
    : decision === 'rate_limit_backoff' ? 'provider_rate_limit_backoff_active'
    : 'provider_failure_backoff_active';
  return {
    decision, reason, createdNewScan: false,
    ...cadenceDecisionFields({ intervalSeconds: params.configuredIntervalSeconds }, cadence),
    nextEligibleAt,
    waitSeconds: deadline === null ? undefined
      : Math.max(0, Math.ceil((deadline.getTime() - params.now.getTime()) / 1000)),
    ...(decision === 'fresh_success' ? { freshnessDeadlineAt: nextEligibleAt }
      : decision === 'rate_limit_backoff'
        ? { rateLimitBackoffUntil: nextEligibleAt, providerHealthState: params.providerHealthState }
        : { providerFailureBackoffUntil: nextEligibleAt, providerHealthState: params.providerHealthState }),
    signals: cadence.providerMinimumIntervalEnforced
      ? [decision, 'provider_minimum_interval_enforced'] : [decision],
  };
};
