import { DomainError, err, ok, type Clock, type Result } from '@social-monitor/shared-kernel';

import type { ScanJob, ScanPolicy, SourceBinding } from '../../domain';
import type {
  ScanExecutionAttemptReadPort,
  ScanExecutionAttemptSnapshot,
  ScanJobHistoryReadPort,
  ScanPolicyRepositoryPort,
  SourceBindingRepositoryPort,
  TopicRepositoryPort,
} from '../../ports';
import { summarizeScanProviderHealth } from '../shared/scan-provider-health-summary';
import { effectiveProviderScanCadence } from '../shared/scan-cadence-policy';
import type { ListTopicSourceDailyHistoryQuery } from './list-topic-source-daily-history.query';
import type {
  ListTopicSourceDailyHistoryResult,
  TopicSourceDailyHistoryCadenceSummaryView,
  TopicSourceDailyHistoryDayView,
  TopicSourceDailyHistoryProviderView,
  TopicSourceDailyHistorySummaryView,
} from './list-topic-source-daily-history.result';

type ListTopicSourceDailyHistoryFailure = DomainError;

const maxHistoryDays = 90;
const maxSourceBindings = 100;
const maxScanJobsPerBindingDay = 100;
const maxProviderFilters = 20;

export class ListTopicSourceDailyHistoryUseCase {
  constructor(
    private readonly topics: TopicRepositoryPort,
    private readonly sourceBindings: SourceBindingRepositoryPort,
    private readonly scanPolicies: ScanPolicyRepositoryPort,
    private readonly scanJobs: ScanJobHistoryReadPort,
    private readonly scanExecutionAttempts: ScanExecutionAttemptReadPort,
    private readonly clock: Clock,
  ) {}

  async execute(
    query: ListTopicSourceDailyHistoryQuery,
  ): Promise<Result<ListTopicSourceDailyHistoryResult, ListTopicSourceDailyHistoryFailure>> {
    if (query.topicId.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Topic id is required'));
    }

    if (!Number.isInteger(query.days) || query.days < 1 || query.days > maxHistoryDays) {
      return err(new DomainError('validation.failed', `Topic source history days must be between 1 and ${maxHistoryDays}`));
    }

    const providerKeys = normalizeProviderKeys(query.providerKeys);
    if (providerKeys instanceof DomainError) {
      return err(providerKeys);
    }

    const topic = await this.topics.findById({
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
      topicId: query.topicId,
    });
    if (topic === null) {
      return err(new DomainError('resource.not_found', 'Topic not found', { topicId: query.topicId }));
    }

    const bindings = await this.sourceBindings.listByTopic({
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
      topicId: query.topicId,
      limit: maxSourceBindings,
    });
    const visibleBindings = filterBindingsByProvider(bindings.sourceBindings, providerKeys);
    const scanPoliciesByBindingId = await scanPoliciesBySourceBindingId({
      scanPolicies: this.scanPolicies,
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
      bindings: visibleBindings,
    });
    const windows = buildUtcDayWindows({
      now: this.clock.now(),
      days: query.days,
    });
    const firstWindow = windows[0];
    const lastWindow = windows[windows.length - 1];
    if (firstWindow === undefined || lastWindow === undefined) {
      return err(new DomainError('validation.failed', 'Topic source history days must be between 1 and 90'));
    }

    const maxScanJobs = query.days * maxScanJobsPerBindingDay * visibleBindings.length;
    const historyEntries = await Promise.all(visibleBindings.map(async (binding) => {
      const snapshot = binding.toSnapshot();
      const history = await this.scanJobs.listBySourceBindingWindow({
        tenantId: query.tenantId,
        workspaceId: query.workspaceId,
        sourceBindingId: snapshot.id,
        windowStartedAt: firstWindow.startedAt,
        windowEndedAt: lastWindow.endedAt,
        limit: query.days * maxScanJobsPerBindingDay,
      });

      return {
        binding,
        scanJobs: history.scanJobs,
        truncated: history.truncated,
      };
    }));
    const scanJobs = historyEntries.flatMap((entry) => entry.scanJobs);
    const attempts = new Map(
      await Promise.all(scanJobs.map(async (job) => {
        const snapshot = job.toSnapshot();
        const latestAttempt = await this.scanExecutionAttempts.findLatestByScanJob({
          tenantId: query.tenantId,
          workspaceId: query.workspaceId,
          scanJobId: snapshot.id,
        });

        return [snapshot.id, latestAttempt] as const;
      })),
    );
    const bindingById = new Map(visibleBindings.map((binding) => [binding.toSnapshot().id, binding]));
    const jobsByDay = new Map<string, readonly ScanJob[]>();
    for (const window of windows) {
      jobsByDay.set(window.date, []);
    }
    for (const job of scanJobs) {
      const snapshot = job.toSnapshot();
      const date = utcDateKey(snapshot.requestedAt);
      const bucket = jobsByDay.get(date);

      if (bucket !== undefined) {
        jobsByDay.set(date, [...bucket, job]);
      }
    }
    const days = windows.map((window) => buildDayView({
      window,
      jobs: jobsByDay.get(window.date) ?? [],
      attempts,
      bindingById,
      bindings: visibleBindings,
      scanPoliciesByBindingId,
    }));

    return ok({
      topicId: query.topicId,
      windowStartedAt: firstWindow.startedAt.toISOString(),
      windowEndedAt: lastWindow.endedAt.toISOString(),
      summary: buildSummaryView({
        days,
        jobs: scanJobs,
        attempts,
        bindingById,
        bindings: visibleBindings,
        scanPoliciesByBindingId,
      }),
      days,
      truncated: bindings.nextCursor !== undefined || historyEntries.some((entry) => entry.truncated),
      maxScanJobs,
    });
  }
}

const buildDayView = (params: {
  readonly window: UtcDayWindow;
  readonly jobs: readonly ScanJob[];
  readonly attempts: ReadonlyMap<string, ScanExecutionAttemptSnapshot | null>;
  readonly bindingById: ReadonlyMap<string, SourceBinding>;
  readonly bindings: readonly SourceBinding[];
  readonly scanPoliciesByBindingId: ReadonlyMap<string, ScanPolicy>;
}): TopicSourceDailyHistoryDayView => {
  const aggregate = buildProviderView('all', params.bindings, params.jobs, params.attempts, params.scanPoliciesByBindingId);

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
      params.attempts,
      params.bindingById,
      params.bindings,
      params.scanPoliciesByBindingId,
    ),
  };
};

const buildSummaryView = (params: {
  readonly days: readonly TopicSourceDailyHistoryDayView[];
  readonly jobs: readonly ScanJob[];
  readonly attempts: ReadonlyMap<string, ScanExecutionAttemptSnapshot | null>;
  readonly bindingById: ReadonlyMap<string, SourceBinding>;
  readonly bindings: readonly SourceBinding[];
  readonly scanPoliciesByBindingId: ReadonlyMap<string, ScanPolicy>;
}): TopicSourceDailyHistorySummaryView => {
  const aggregate = buildProviderView('all', params.bindings, params.jobs, params.attempts, params.scanPoliciesByBindingId);

  return {
    providerHealthState: aggregate.providerHealthState,
    sourceBindingCount: aggregate.sourceBindingCount,
    enabledSourceBindingCount: aggregate.enabledSourceBindingCount,
    pausedSourceBindingCount: aggregate.pausedSourceBindingCount,
    configuredSourceBindingCount: aggregate.configuredSourceBindingCount,
    unconfiguredSourceBindingCount: aggregate.unconfiguredSourceBindingCount,
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
      params.attempts,
      params.bindingById,
      params.bindings,
      params.scanPoliciesByBindingId,
    ),
  };
};

const buildProviderBreakdown = (
  jobs: readonly ScanJob[],
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
  attempts: ReadonlyMap<string, ScanExecutionAttemptSnapshot | null>,
  scanPoliciesByBindingId: ReadonlyMap<string, ScanPolicy>,
): TopicSourceDailyHistoryProviderView => {
  const configuredSourceBindingCount = countConfiguredBindings(bindings, scanPoliciesByBindingId);
  const snapshots = jobs
    .map((job) => job.toSnapshot())
    .sort((left, right) => {
      const requestedDiff = right.requestedAt.getTime() - left.requestedAt.getTime();

      if (requestedDiff !== 0) {
        return requestedDiff;
      }

      return right.id.localeCompare(left.id);
    });
  const health = summarizeScanProviderHealth(snapshots);
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

const scanPoliciesBySourceBindingId = async (params: {
  readonly scanPolicies: ScanPolicyRepositoryPort;
  readonly tenantId: ListTopicSourceDailyHistoryQuery['tenantId'];
  readonly workspaceId: ListTopicSourceDailyHistoryQuery['workspaceId'];
  readonly bindings: readonly SourceBinding[];
}): Promise<ReadonlyMap<string, ScanPolicy>> => {
  const entries = await Promise.all(params.bindings.map(async (binding) => {
    const snapshot = binding.toSnapshot();
    const policy = await params.scanPolicies.findBySourceBinding({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      sourceBindingId: snapshot.id,
    });

    return [snapshot.id, policy] as const;
  }));

  return new Map(
    entries.filter((entry): entry is readonly [string, ScanPolicy] => entry[1] !== null),
  );
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

const normalizeProviderKeys = (
  providerKeys: readonly string[] | undefined,
): readonly string[] | DomainError => {
  if (providerKeys === undefined) {
    return [];
  }

  const normalized = Array.from(new Set(providerKeys.map((providerKey) => providerKey.trim()).filter(Boolean))).sort();
  if (providerKeys.length > 0 && normalized.length === 0) {
    return new DomainError('validation.failed', 'Topic source history providerKey filter must not be empty');
  }

  if (normalized.length > maxProviderFilters) {
    return new DomainError(
      'validation.failed',
      `Topic source history providerKey filter must include at most ${maxProviderFilters} providers`,
    );
  }

  return normalized;
};

const filterBindingsByProvider = (
  bindings: readonly SourceBinding[],
  providerKeys: readonly string[],
): readonly SourceBinding[] => {
  if (providerKeys.length === 0) {
    return bindings;
  }

  const providerFilter = new Set(providerKeys);

  return bindings.filter((binding) => providerFilter.has(binding.toSnapshot().providerKey));
};

type UtcDayWindow = {
  readonly date: string;
  readonly startedAt: Date;
  readonly endedAt: Date;
};

const buildUtcDayWindows = (params: {
  readonly now: Date;
  readonly days: number;
}): readonly UtcDayWindow[] => {
  const todayStart = Date.UTC(
    params.now.getUTCFullYear(),
    params.now.getUTCMonth(),
    params.now.getUTCDate(),
  );
  const firstStart = todayStart - (params.days - 1) * 24 * 60 * 60 * 1000;

  return Array.from({ length: params.days }, (_, index) => {
    const startedAt = new Date(firstStart + index * 24 * 60 * 60 * 1000);
    const endedAt = new Date(startedAt.getTime() + 24 * 60 * 60 * 1000);

    return {
      date: utcDateKey(startedAt),
      startedAt,
      endedAt,
    };
  });
};

const utcDateKey = (date: Date): string => date.toISOString().slice(0, 10);

const sumAttempts = (
  attempts: readonly ScanExecutionAttemptSnapshot[],
  field: 'fetched' | 'inserted' | 'skippedDuplicates' | 'projected',
): number =>
  attempts.reduce((total, attempt) => total + attempt[field], 0);
