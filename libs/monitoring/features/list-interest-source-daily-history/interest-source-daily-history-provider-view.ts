import type { ScanJob, ScanPolicy, SourceBinding } from '../../domain';
import type { ScanExecutionAttemptSnapshot, ScanSchedulerDecisionRecord } from '../../ports';
import { effectiveProviderScanCadence } from '../../domain/policies/provider-scan-cadence';
import { summarizeScanProviderHealth } from '../shared/scan-provider-health-summary';
import {
  providerHealthWithSchedulerBackoff,
  summarizeScanSchedulerDecisions,
} from '../shared/scan-scheduler-decision-summary';
import type {
  InterestSourceDailyHistoryCadenceSummaryView,
  InterestSourceDailyHistoryProviderView,
  InterestSourceDailyHistoryScanCoverageState,
} from './list-interest-source-daily-history.result';

/** Provider-scoped daily and cross-day projections share one reporting policy. */
export const buildProviderBreakdown = (
  jobs: readonly ScanJob[],
  schedulerDecisions: readonly ScanSchedulerDecisionRecord[],
  attempts: ReadonlyMap<string, ScanExecutionAttemptSnapshot | null>,
  bindingById: ReadonlyMap<string, SourceBinding>,
  bindings: readonly SourceBinding[],
  scanPoliciesByBindingId: ReadonlyMap<string, ScanPolicy>,
): readonly InterestSourceDailyHistoryProviderView[] => {
  const bindingsByProvider = new Map<string, SourceBinding[]>();
  for (const binding of bindings) {
    const providerKey = binding.toSnapshot().providerKey;
    const providerBindings = bindingsByProvider.get(providerKey);
    if (providerBindings === undefined) {
      bindingsByProvider.set(providerKey, [binding]);
    } else {
      providerBindings.push(binding);
    }
  }

  return Array.from(bindingsByProvider.entries())
    .map(([providerKey, providerBindings]) =>
      buildProviderView(
        providerKey,
        providerBindings,
        jobs.filter((job) => bindingById.get(job.toSnapshot().sourceBindingId)?.toSnapshot().providerKey === providerKey),
        schedulerDecisions.filter((decision) =>
          bindingById.get(decision.sourceBindingId)?.toSnapshot().providerKey === providerKey,
        ),
        attempts,
        scanPoliciesByBindingId,
      ),
    )
    .sort((left, right) => left.providerKey.localeCompare(right.providerKey));
};

export const buildProviderView = (
  providerKey: string,
  bindings: readonly SourceBinding[],
  jobs: readonly ScanJob[],
  schedulerDecisions: readonly ScanSchedulerDecisionRecord[],
  attempts: ReadonlyMap<string, ScanExecutionAttemptSnapshot | null>,
  scanPoliciesByBindingId: ReadonlyMap<string, ScanPolicy>,
): InterestSourceDailyHistoryProviderView => {
  const enabledSourceBindingCount = countBindingsByStatus(bindings, 'enabled');
  const pausedSourceBindingCount = countBindingsByStatus(bindings, 'paused');
  const configuredSourceBindingCount = countConfiguredBindings(bindings, scanPoliciesByBindingId);
  const scannedSourceBindingCount = countScannedBindings(bindings, jobs);
  const unscannedSourceBindingCount = bindings.length - scannedSourceBindingCount;
  const coverageState = scanCoverageState({
    sourceBindingCount: bindings.length,
    scannedSourceBindingCount,
  });
  const snapshots = jobs
    .map((job) => job.toSnapshot())
    .sort((left, right) => {
      const requestedDiff = right.requestedAt.getTime() - left.requestedAt.getTime();

      if (requestedDiff !== 0) {
        return requestedDiff;
      }

      return right.id.localeCompare(left.id);
    });
  const schedulerSummary = summarizeScanSchedulerDecisions(schedulerDecisions);
  const health = providerHealthWithSchedulerBackoff(
    summarizeScanProviderHealth(snapshots),
    schedulerSummary.schedulerSkippedByReason,
  );
  const latestAttempts = snapshots
    .map((snapshot) => attempts.get(snapshot.id))
    .filter((attempt): attempt is NonNullable<typeof attempt> => attempt !== null && attempt !== undefined);
  const cadenceSummary = summarizeProviderCadence(bindings, scanPoliciesByBindingId);
  const signals = dailyHistorySignals({
    healthSignals: health.signals,
    sourceBindingCount: bindings.length,
    pausedSourceBindingCount,
    unconfiguredSourceBindingCount: bindings.length - configuredSourceBindingCount,
    unscannedSourceBindingCount,
    scanCoverageState: coverageState,
    cadenceSummary,
  });

  return {
    providerKey,
    sourceBindingCount: bindings.length,
    enabledSourceBindingCount,
    pausedSourceBindingCount,
    configuredSourceBindingCount,
    unconfiguredSourceBindingCount: bindings.length - configuredSourceBindingCount,
    scannedSourceBindingCount,
    unscannedSourceBindingCount,
    scanCoverageState: coverageState,
    schedulerDecisionCount: schedulerSummary.schedulerDecisionCount,
    schedulerEnqueuedCount: schedulerSummary.schedulerEnqueuedCount,
    schedulerSkippedCount: schedulerSummary.schedulerSkippedCount,
    schedulerSkippedByReason: schedulerSummary.schedulerSkippedByReason,
    lastSchedulerEvaluatedAt: schedulerSummary.lastSchedulerEvaluatedAt,
    cadenceSummary,
    providerHealthState: health.providerHealthState,
    totalScans: health.totalScans,
    succeededScans: health.succeededScans,
    failedScans: health.failedScans,
    activeScans: health.activeScans,
    rateLimitedScans: health.rateLimitedScans,
    providerUnavailableScans: health.providerUnavailableScans,
    consecutiveFailures: health.consecutiveFailures,
    fetched: sumAttempts(latestAttempts, 'fetched'),
    inserted: sumAttempts(latestAttempts, 'inserted'),
    skippedDuplicates: sumAttempts(latestAttempts, 'skippedDuplicates'),
    projected: sumAttempts(latestAttempts, 'projected'),
    lastScanRequestedAt: snapshots[0]?.requestedAt.toISOString(),
    lastCompletedAt: snapshots
      .flatMap((snapshot) => snapshot.completedAt === undefined ? [] : [snapshot.completedAt])
      .sort((left, right) => right.getTime() - left.getTime())[0]?.toISOString(),
    operatorAction: dailyHistoryOperatorAction({
      healthOperatorAction: health.operatorAction,
      healthState: health.providerHealthState,
      pausedSourceBindingCount,
      unconfiguredSourceBindingCount: bindings.length - configuredSourceBindingCount,
      scanCoverageState: coverageState,
    }),
    signals,
  };
};

const dailyHistorySignals = (params: {
  readonly healthSignals: readonly string[];
  readonly sourceBindingCount: number;
  readonly pausedSourceBindingCount: number;
  readonly unconfiguredSourceBindingCount: number;
  readonly unscannedSourceBindingCount: number;
  readonly scanCoverageState: InterestSourceDailyHistoryScanCoverageState;
  readonly cadenceSummary?: InterestSourceDailyHistoryCadenceSummaryView;
}): readonly string[] => {
  const signals = [...params.healthSignals];

  if (params.sourceBindingCount === 0) {
    signals.push('no_source_bindings');
  }
  if (params.pausedSourceBindingCount > 0) {
    signals.push('paused_source_bindings');
  }
  if (params.unconfiguredSourceBindingCount > 0) {
    signals.push('unconfigured_source_bindings');
  }
  if (params.unscannedSourceBindingCount > 0) {
    signals.push('unscanned_source_bindings');
  }
  if (params.scanCoverageState === 'none_scanned') {
    signals.push('no_scan_coverage');
  }
  if (params.scanCoverageState === 'partial') {
    signals.push('partial_scan_coverage');
  }
  if (params.cadenceSummary?.providerMinimumIntervalEnforced === true) {
    signals.push('provider_minimum_interval_enforced');
  }

  return [...new Set(signals)];
};

const dailyHistoryOperatorAction = (params: {
  readonly healthOperatorAction: string;
  readonly healthState: 'unknown' | 'operational' | 'degraded' | 'down';
  readonly pausedSourceBindingCount: number;
  readonly unconfiguredSourceBindingCount: number;
  readonly scanCoverageState: InterestSourceDailyHistoryScanCoverageState;
}): string => {
  if (params.healthState === 'down' || params.healthState === 'degraded') {
    return params.healthOperatorAction;
  }

  if (params.unconfiguredSourceBindingCount > 0) {
    return 'create_scan_policy_for_unconfigured_source_bindings';
  }

  if (params.pausedSourceBindingCount > 0 && params.scanCoverageState !== 'complete') {
    return 'resume_paused_sources_or_confirm_they_are_excluded';
  }

  if (params.scanCoverageState === 'partial') {
    return 'inspect_unscanned_source_bindings_before_claiming_freshness';
  }

  return params.healthOperatorAction;
};

const countBindingsByStatus = (
  bindings: readonly SourceBinding[],
  status: 'enabled' | 'paused',
): number =>
  bindings.filter((binding) => binding.toSnapshot().status === status).length;

const countConfiguredBindings = (
  bindings: readonly SourceBinding[],
  scanPoliciesByBindingId: ReadonlyMap<string, ScanPolicy>,
): number =>
  bindings.filter((binding) => scanPoliciesByBindingId.has(binding.toSnapshot().id)).length;

const countScannedBindings = (
  bindings: readonly SourceBinding[],
  jobs: readonly ScanJob[],
): number => {
  const bindingIds = new Set(bindings.map((binding) => binding.toSnapshot().id));
  const scannedBindingIds = new Set(
    jobs
      .map((job) => job.toSnapshot())
      .filter((job) => job.status === 'succeeded' || job.status === 'failed')
      .map((job) => job.sourceBindingId)
      .filter((sourceBindingId) => bindingIds.has(sourceBindingId)),
  );

  return scannedBindingIds.size;
};

const scanCoverageState = (params: {
  readonly sourceBindingCount: number;
  readonly scannedSourceBindingCount: number;
}): InterestSourceDailyHistoryScanCoverageState => {
  if (params.sourceBindingCount === 0) {
    return 'no_sources';
  }

  if (params.scannedSourceBindingCount === 0) {
    return 'none_scanned';
  }

  if (params.scannedSourceBindingCount >= params.sourceBindingCount) {
    return 'complete';
  }

  return 'partial';
};

const summarizeProviderCadence = (
  bindings: readonly SourceBinding[],
  scanPoliciesByBindingId: ReadonlyMap<string, ScanPolicy>,
): InterestSourceDailyHistoryCadenceSummaryView | undefined => {
  const cadenceViews = bindings
    .map((binding) => {
      const bindingSnapshot = binding.toSnapshot();
      const policy = scanPoliciesByBindingId.get(bindingSnapshot.id);

      if (policy === undefined) {
        return undefined;
      }

      const policySnapshot = policy.toSnapshot();
      const cadence = effectiveProviderScanCadence({
        providerKey: bindingSnapshot.providerKey,
        intervalSeconds: policySnapshot.intervalSeconds,
        freshnessSeconds: policySnapshot.freshnessSeconds,
      });

      return {
        minimumIntervalSeconds: cadence.minimumIntervalSeconds,
        configuredIntervalSeconds: policySnapshot.intervalSeconds,
        effectiveIntervalSeconds: cadence.intervalSeconds,
        effectiveFreshnessSeconds: cadence.freshnessSeconds,
        providerMinimumIntervalEnforced: cadence.providerMinimumIntervalEnforced,
      };
    })
    .filter((cadence): cadence is NonNullable<typeof cadence> => cadence !== undefined);

  if (cadenceViews.length === 0) {
    return undefined;
  }

  return {
    sourceBindingCount: cadenceViews.length,
    minimumIntervalSeconds: Math.max(...cadenceViews.map((cadence) => cadence.minimumIntervalSeconds)),
    minConfiguredIntervalSeconds: Math.min(...cadenceViews.map((cadence) => cadence.configuredIntervalSeconds)),
    maxConfiguredIntervalSeconds: Math.max(...cadenceViews.map((cadence) => cadence.configuredIntervalSeconds)),
    minEffectiveIntervalSeconds: Math.min(...cadenceViews.map((cadence) => cadence.effectiveIntervalSeconds)),
    maxEffectiveIntervalSeconds: Math.max(...cadenceViews.map((cadence) => cadence.effectiveIntervalSeconds)),
    minEffectiveFreshnessSeconds: Math.min(...cadenceViews.map((cadence) => cadence.effectiveFreshnessSeconds)),
    maxEffectiveFreshnessSeconds: Math.max(...cadenceViews.map((cadence) => cadence.effectiveFreshnessSeconds)),
    providerMinimumIntervalEnforced: cadenceViews.some((cadence) => cadence.providerMinimumIntervalEnforced),
  };
};

const sumAttempts = (
  attempts: readonly ScanExecutionAttemptSnapshot[],
  field: 'fetched' | 'inserted' | 'skippedDuplicates' | 'projected',
): number =>
  attempts.reduce((total, attempt) => total + attempt[field], 0);
