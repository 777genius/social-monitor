import type { ScanJobProps } from '../entities/scan-job';
import type { EffectiveProviderScanCadence } from './provider-scan-cadence';
import {
  boundedTransientProviderBackoffSeconds,
  isFreshSuccessfulScan,
  providerFailureBackoffUntil,
  rateLimitBackoffUntil,
} from './scan-freshness-policy';

export type ScanAdmissionReason =
  | 'active_scan'
  | 'duplicate_window'
  | 'fresh_success'
  | 'rate_limit_backoff'
  | 'provider_failure_backoff';

export type ScanAdmissionFacts = {
  readonly activeScan: boolean;
  readonly latestJob: ScanJobProps | null;
  // Callers own their query window: admission uses five jobs; health uses fifty.
  readonly recentJobs: readonly ScanJobProps[];
  readonly cadence: EffectiveProviderScanCadence;
  readonly now: Date;
};

export type ScanAdmissionAssessment = {
  readonly reason: ScanAdmissionReason | null;
  readonly freshSuccess: boolean;
  readonly freshnessDeadlineAt: Date | null;
  readonly rateLimitBackoff: Date | null;
  readonly providerFailureBackoff: Date | null;
};

export const evaluateManualScanAdmission = (
  facts: ScanAdmissionFacts,
): ScanAdmissionAssessment => assess(facts, false);

// Due-time eligibility belongs to scheduling; a manual request deliberately
// ignores the policy's next run. Duplicate scheduled windows never block it.
export const evaluateScheduledScanAdmission = (
  facts: ScanAdmissionFacts & { readonly duplicateWindow: boolean },
): ScanAdmissionAssessment => assess(facts, facts.duplicateWindow);

const assess = (facts: ScanAdmissionFacts, duplicateWindow: boolean): ScanAdmissionAssessment => {
  const backoffSeconds = boundedTransientProviderBackoffSeconds({
    intervalSeconds: facts.cadence.intervalSeconds,
  });
  const freshSuccess = isFreshSuccessfulScan({
    latestJob: facts.latestJob,
    freshnessSeconds: facts.cadence.freshnessSeconds,
    now: facts.now,
  });
  const rateLimitBackoff = rateLimitBackoffUntil({
    latestJob: facts.latestJob, backoffSeconds, now: facts.now,
  });
  const providerFailureBackoff = providerFailureBackoffUntil({
    recentJobs: facts.recentJobs, backoffSeconds, now: facts.now,
  });
  const reason = facts.activeScan ? 'active_scan'
    : duplicateWindow ? 'duplicate_window'
    : freshSuccess ? 'fresh_success'
    : rateLimitBackoff !== null ? 'rate_limit_backoff'
    : providerFailureBackoff !== null ? 'provider_failure_backoff'
    : null;

  return {
    reason,
    freshSuccess,
    freshnessDeadlineAt: freshSuccess && facts.latestJob?.completedAt !== undefined
      ? new Date(facts.latestJob.completedAt.getTime() + facts.cadence.freshnessSeconds * 1000)
      : null,
    rateLimitBackoff,
    providerFailureBackoff,
  };
};
