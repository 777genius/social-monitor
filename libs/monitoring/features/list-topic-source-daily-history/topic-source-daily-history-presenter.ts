import type { ScanJob, ScanPolicy, SourceBinding } from '../../domain';
import type {
  ScanExecutionAttemptSnapshot,
  ScanSchedulerDecisionRecord,
} from '../../ports';
import { effectiveProviderScanCadence } from '../shared/scan-cadence-policy';
import {
  summarizeScanProviderHealth,
  type ScanProviderHealthSummary,
} from '../shared/scan-provider-health-summary';
import {
  summarizeScanSchedulerDecisions,
  type ScanSchedulerSkipBreakdownView,
} from '../shared/scan-scheduler-decision-summary';
import type {
  TopicSourceDailyHistoryCadenceSummaryView,
  TopicSourceDailyHistoryDayView,
  TopicSourceDailyHistoryProviderView,
  TopicSourceDailyHistoryScanCoverageState,
  TopicSourceDailyHistorySummaryView,
} from './list-topic-source-daily-history.result';

type TopicSourceDailyHistoryWindow = {
  readonly date: string;
  readonly startedAt: Date;
  readonly endedAt: Date;
};

export const buildTopicSourceDailyHistoryDayView = (params: {
  readonly window: TopicSourceDailyHistoryWindow;
  readonly jobs: readonly ScanJob[];
  readonly schedulerDecisions: readonly ScanSchedulerDecisionRecord[];
  readonly attempts: ReadonlyMap<string, ScanExecutionAttemptSnapshot | null>;
  readonly bindingById: ReadonlyMap<string, SourceBinding>;
  readonly bindings: readonly SourceBinding[];
  readonly scanPoliciesByBindingId: ReadonlyMap<string, ScanPolicy>;
}): TopicSourceDailyHistoryDayView => {
  const aggregate = buildProviderView(
    'all',
    params.bindings,
    params.jobs,
    params.schedulerDecisions,
    params.attempts,
    params.scanPoliciesByBindingId,
  );

  return {
    date: params.window.date,
    windowStartedAt: params.window.startedAt.toISOString(),
    windowEndedAt: params.window.endedAt.toISOString(),
    providerHealthState: aggregate.providerHealthState,
    sourceBindingCount: aggregate.sourceBindingCount,
    enabledSourceBindingCount: aggregate.enabledSourceBindingCount,
    pausedSourceBindingCount: aggregate.pausedSourceBindingCount,
    configuredSourceBindingCount: aggregate.configuredSourceBindingCount,
    unconfiguredSourceBindingCount: aggregate.unconfiguredSourceBindingCount,
    scannedSourceBindingCount: aggregate.scannedSourceBindingCount,
    unscannedSourceBindingCount: aggregate.unscannedSourceBindingCount,
    scanCoverageState: aggregate.scanCoverageState,
    schedulerDecisionCount: aggregate.schedulerDecisionCount,
    schedulerEnqueuedCount: aggregate.schedulerEnqueuedCount,
    schedulerSkippedCount: aggregate.schedulerSkippedCount,
    schedulerSkippedByReason: aggregate.schedulerSkippedByReason,
    lastSchedulerEvaluatedAt: aggregate.lastSchedulerEvaluatedAt,
    totalScans: aggregate.totalScans,
    succeededScans: aggregate.succeededScans,
    failedScans: aggregate.failedScans,
    activeScans: aggregate.activeScans,
    rateLimitedScans: aggregate.rateLimitedScans,
    providerUnavailableScans: aggregate.providerUnavailableScans,
    consecutiveFailures: aggregate.consecutiveFailures,
    fetched: aggregate.fetched,
    inserted: aggregate.inserted,
    skippedDuplicates: aggregate.skippedDuplicates,
    projected: aggregate.projected,
    lastScanRequestedAt: aggregate.lastScanRequestedAt,
    lastCompletedAt: aggregate.lastCompletedAt,
    operatorAction: aggregate.operatorAction,
    signals: aggregate.signals,
    providerBreakdown: buildProviderBreakdown(
      params.jobs,
      params.schedulerDecisions,
      params.attempts,
      params.bindingById,
      params.bindings,
      params.scanPoliciesByBindingId,
    ),
  };
};

export const buildTopicSourceDailyHistorySummaryView = (params: {
  readonly days: readonly TopicSourceDailyHistoryDayView[];
  readonly jobs: readonly ScanJob[];
  readonly schedulerDecisions: readonly ScanSchedulerDecisionRecord[];
  readonly attempts: ReadonlyMap<string, ScanExecutionAttemptSnapshot | null>;
  readonly bindingById: ReadonlyMap<string, SourceBinding>;
  readonly bindings: readonly SourceBinding[];
  readonly scanPoliciesByBindingId: ReadonlyMap<string, ScanPolicy>;
}): TopicSourceDailyHistorySummaryView => {
  const aggregate = buildProviderView(
    'all',
    params.bindings,
    params.jobs,
    params.schedulerDecisions,
    params.attempts,
    params.scanPoliciesByBindingId,
  );

  return {
    providerHealthState: aggregate.providerHealthState,
    sourceBindingCount: aggregate.sourceBindingCount,
    enabledSourceBindingCount: aggregate.enabledSourceBindingCount,
    pausedSourceBindingCount: aggregate.pausedSourceBindingCount,
    configuredSourceBindingCount: aggregate.configuredSourceBindingCount,
    unconfiguredSourceBindingCount: aggregate.unconfiguredSourceBindingCount,
    scannedSourceBindingCount: aggregate.scannedSourceBindingCount,
    unscannedSourceBindingCount: aggregate.unscannedSourceBindingCount,
    scanCoverageState: aggregate.scanCoverageState,
    schedulerDecisionCount: aggregate.schedulerDecisionCount,
    schedulerEnqueuedCount: aggregate.schedulerEnqueuedCount,
    schedulerSkippedCount: aggregate.schedulerSkippedCount,
    schedulerSkippedByReason: aggregate.schedulerSkippedByReason,
    lastSchedulerEvaluatedAt: aggregate.lastSchedulerEvaluatedAt,
    totalScans: aggregate.totalScans,
    succeededScans: aggregate.succeededScans,
    failedScans: aggregate.failedScans,
    activeScans: aggregate.activeScans,
    rateLimitedScans: aggregate.rateLimitedScans,
    providerUnavailableScans: aggregate.providerUnavailableScans,
    consecutiveFailures: aggregate.consecutiveFailures,
    fetched: aggregate.fetched,
    inserted: aggregate.inserted,
    skippedDuplicates: aggregate.skippedDuplicates,
    projected: aggregate.projected,
    daysWithScans: params.days.filter((day) => day.totalScans > 0).length,
    daysWithFailures: params.days.filter((day) => day.failedScans > 0).length,
    daysWithRateLimits: params.days.filter((day) => day.rateLimitedScans > 0).length,
    lastScanRequestedAt: aggregate.lastScanRequestedAt,
    lastCompletedAt: aggregate.lastCompletedAt,
    operatorAction: aggregate.operatorAction,
    signals: aggregate.signals,
    providerBreakdown: buildProviderBreakdown(
      params.jobs,
      params.schedulerDecisions,
      params.attempts,
      params.bindingById,
      params.bindings,
      params.scanPoliciesByBindingId,
    ),
  };
};

const buildProviderBreakdown = (
  jobs: readonly ScanJob[],
  schedulerDecisions: readonly ScanSchedulerDecisionRecord[],
  attempts: ReadonlyMap<string, ScanExecutionAttemptSnapshot | null>,
  bindingById: ReadonlyMap<string, SourceBinding>,
  bindings: readonly SourceBinding[],
  scanPoliciesByBindingId: ReadonlyMap<string, ScanPolicy>,
): readonly TopicSourceDailyHistoryProviderView[] => {
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

const buildProviderView = (
  providerKey: string,
  bindings: readonly SourceBinding[],
  jobs: readonly ScanJob[],
  schedulerDecisions: readonly ScanSchedulerDecisionRecord[],
  attempts: ReadonlyMap<string, ScanExecutionAttemptSnapshot | null>,
  scanPoliciesByBindingId: ReadonlyMap<string, ScanPolicy>,
): TopicSourceDailyHistoryProviderView => {
  const configuredSourceBindingCount = countConfiguredBindings(bindings, scanPoliciesByBindingId);
  const scannedSourceBindingCount = countScannedBindings(bindings, jobs);
  const unscannedSourceBindingCount = bindings.length - scannedSourceBindingCount;
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

  return {
    providerKey,
    sourceBindingCount: bindings.length,
    enabledSourceBindingCount: countBindingsByStatus(bindings, 'enabled'),
    pausedSourceBindingCount: countBindingsByStatus(bindings, 'paused'),
    configuredSourceBindingCount,
    unconfiguredSourceBindingCount: bindings.length - configuredSourceBindingCount,
    scannedSourceBindingCount,
    unscannedSourceBindingCount,
    scanCoverageState: scanCoverageState({
      sourceBindingCount: bindings.length,
      scannedSourceBindingCount,
    }),
    schedulerDecisionCount: schedulerSummary.schedulerDecisionCount,
    schedulerEnqueuedCount: schedulerSummary.schedulerEnqueuedCount,
    schedulerSkippedCount: schedulerSummary.schedulerSkippedCount,
    schedulerSkippedByReason: schedulerSummary.schedulerSkippedByReason,
    lastSchedulerEvaluatedAt: schedulerSummary.lastSchedulerEvaluatedAt,
    cadenceSummary: summarizeProviderCadence(bindings, scanPoliciesByBindingId),
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
      .map((snapshot) => snapshot.completedAt)
      .find((completedAt): completedAt is Date => completedAt !== undefined)
      ?.toISOString(),
    operatorAction: health.operatorAction,
    signals: health.signals,
  };
};

const providerHealthWithSchedulerBackoff = (
  health: ScanProviderHealthSummary,
  skippedByReason: ScanSchedulerSkipBreakdownView,
): ScanProviderHealthSummary => {
  if (skippedByReason.providerFailureBackoff > 0) {
    return {
      ...health,
      providerHealthState: 'down',
      operatorAction: 'pause_or_backoff_provider_until_recovery',
      signals: uniqueStable([
        ...health.signals,
        'provider_failure_backoff',
      ]),
    };
  }

  if (
    skippedByReason.rateLimitBackoff > 0 &&
    health.providerHealthState !== 'down'
  ) {
    return {
      ...health,
      providerHealthState: 'degraded',
      operatorAction: 'inspect_recent_scan_failures_and_rate_limits',
      signals: uniqueStable([
        ...health.signals,
        'rate_limit_backoff',
      ]),
    };
  }

  return health;
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
      .map((job) => job.toSnapshot().sourceBindingId)
      .filter((sourceBindingId) => bindingIds.has(sourceBindingId)),
  );

  return scannedBindingIds.size;
};

const scanCoverageState = (params: {
  readonly sourceBindingCount: number;
  readonly scannedSourceBindingCount: number;
}): TopicSourceDailyHistoryScanCoverageState => {
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
): TopicSourceDailyHistoryCadenceSummaryView | undefined => {
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

const uniqueStable = <TValue>(values: readonly TValue[]): readonly TValue[] => {
  const seen = new Set<TValue>();
  const result: TValue[] = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    result.push(value);
  }

  return result;
};
