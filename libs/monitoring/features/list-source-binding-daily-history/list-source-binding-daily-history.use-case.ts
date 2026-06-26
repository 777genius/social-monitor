import { DomainError, err, ok, type Clock, type Result } from '@social-monitor/shared-kernel';

import type { ScanJob } from '../../domain';
import type {
  ScanExecutionAttemptReadPort,
  ScanExecutionAttemptSnapshot,
  ScanJobHistoryReadPort,
  ScanPolicyRepositoryPort,
  ScanSchedulerDecisionHistoryPort,
  ScanSchedulerDecisionRecord,
  SourceBindingRepositoryPort,
} from '../../ports';
import { summarizeScanProviderHealth } from '../shared/scan-provider-health-summary';
import { summarizeScanSchedulerDecisions } from '../shared/scan-scheduler-decision-summary';
import { presentScanPolicy } from '../shared/scan-policy-presenter';
import type { ListSourceBindingDailyHistoryQuery } from './list-source-binding-daily-history.query';
import type {
  ListSourceBindingDailyHistoryResult,
  SourceBindingDailyHistoryDayView,
  SourceBindingDailyHistorySummaryView,
} from './list-source-binding-daily-history.result';

type ListSourceBindingDailyHistoryFailure = DomainError;

const maxHistoryDays = 90;
const maxScanJobsPerDay = 100;
const maxSchedulerDecisionsPerDay = 100;

export class ListSourceBindingDailyHistoryUseCase {
  constructor(
    private readonly sourceBindings: SourceBindingRepositoryPort,
    private readonly scanPolicies: ScanPolicyRepositoryPort,
    private readonly scanJobs: ScanJobHistoryReadPort,
    private readonly scanExecutionAttempts: ScanExecutionAttemptReadPort,
    private readonly clock: Clock,
    private readonly schedulerDecisions?: ScanSchedulerDecisionHistoryPort,
  ) {}

  async execute(
    query: ListSourceBindingDailyHistoryQuery,
  ): Promise<Result<ListSourceBindingDailyHistoryResult, ListSourceBindingDailyHistoryFailure>> {
    if (query.sourceBindingId.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Source binding id is required'));
    }

    if (!Number.isInteger(query.days) || query.days < 1 || query.days > maxHistoryDays) {
      return err(new DomainError('validation.failed', `Scan history days must be between 1 and ${maxHistoryDays}`));
    }

    const binding = await this.sourceBindings.findById({
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
      sourceBindingId: query.sourceBindingId,
    });

    if (binding === null) {
      return err(new DomainError('resource.not_found', 'Source binding not found', {
        sourceBindingId: query.sourceBindingId,
      }));
    }
    const bindingSnapshot = binding.toSnapshot();
    const scanPolicy = await this.scanPolicies.findBySourceBinding({
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
      sourceBindingId: query.sourceBindingId,
    });
    const cadence = scanPolicy === null
      ? undefined
      : presentScanPolicy(scanPolicy, { providerKey: bindingSnapshot.providerKey }).cadence;

    const windows = buildUtcDayWindows({
      now: this.clock.now(),
      days: query.days,
    });
    const firstWindow = windows[0];
    const lastWindow = windows[windows.length - 1];
    if (firstWindow === undefined || lastWindow === undefined) {
      return err(new DomainError('validation.failed', 'Scan history days must be between 1 and 90'));
    }
    const maxScanJobs = query.days * maxScanJobsPerDay;
    const [history, schedulerHistory] = await Promise.all([
      this.scanJobs.listBySourceBindingWindow({
        tenantId: query.tenantId,
        workspaceId: query.workspaceId,
        sourceBindingId: query.sourceBindingId,
        windowStartedAt: firstWindow.startedAt,
        windowEndedAt: lastWindow.endedAt,
        limit: maxScanJobs,
      }),
      this.schedulerDecisions?.listBySourceBindingWindow({
        tenantId: query.tenantId,
        workspaceId: query.workspaceId,
        sourceBindingId: query.sourceBindingId,
        windowStartedAt: firstWindow.startedAt,
        windowEndedAt: lastWindow.endedAt,
        limit: query.days * maxSchedulerDecisionsPerDay,
      }) ?? Promise.resolve({ records: [], truncated: false }),
    ]);
    const attempts = new Map(
      await Promise.all(history.scanJobs.map(async (job) => {
        const snapshot = job.toSnapshot();
        const latestAttempt = await this.scanExecutionAttempts.findLatestByScanJob({
          tenantId: query.tenantId,
          workspaceId: query.workspaceId,
          scanJobId: snapshot.id,
        });

        return [snapshot.id, latestAttempt] as const;
      })),
    );
    const jobsByDay = new Map<string, readonly ScanJob[]>();
    const schedulerDecisionsByDay = new Map<string, readonly ScanSchedulerDecisionRecord[]>();
    for (const window of windows) {
      jobsByDay.set(window.date, []);
      schedulerDecisionsByDay.set(window.date, []);
    }
    for (const job of history.scanJobs) {
      const snapshot = job.toSnapshot();
      const date = utcDateKey(snapshot.requestedAt);
      const bucket = jobsByDay.get(date);

      if (bucket !== undefined) {
        jobsByDay.set(date, [...bucket, job]);
      }
    }
    for (const decision of schedulerHistory.records) {
      const date = utcDateKey(decision.evaluatedAt);
      const bucket = schedulerDecisionsByDay.get(date);

      if (bucket !== undefined) {
        schedulerDecisionsByDay.set(date, [...bucket, decision]);
      }
    }
    const days = windows.map((window) => buildDayView({
      window,
      jobs: jobsByDay.get(window.date) ?? [],
      schedulerDecisions: schedulerDecisionsByDay.get(window.date) ?? [],
      attempts,
    }));

    return ok({
      sourceBindingId: query.sourceBindingId,
      topicId: bindingSnapshot.topicId,
      providerKey: bindingSnapshot.providerKey,
      sourceBindingStatus: bindingSnapshot.status,
      cadence,
      windowStartedAt: firstWindow.startedAt.toISOString(),
      windowEndedAt: lastWindow.endedAt.toISOString(),
      summary: buildSummaryView({
        days,
        jobs: history.scanJobs,
        schedulerDecisions: schedulerHistory.records,
        attempts,
      }),
      days,
      truncated: history.truncated || schedulerHistory.truncated,
      maxScanJobs,
    });
  }
}

const buildDayView = (params: {
  readonly window: UtcDayWindow;
  readonly jobs: readonly ScanJob[];
  readonly schedulerDecisions: readonly ScanSchedulerDecisionRecord[];
  readonly attempts: ReadonlyMap<string, ScanExecutionAttemptSnapshot | null>;
}): SourceBindingDailyHistoryDayView => {
  const snapshots = params.jobs.map((job) => job.toSnapshot());
  const health = summarizeScanProviderHealth(snapshots);
  const schedulerSummary = summarizeScanSchedulerDecisions(params.schedulerDecisions);
  const latestAttempts = snapshots
    .map((snapshot) => params.attempts.get(snapshot.id))
    .filter((attempt): attempt is NonNullable<typeof attempt> => attempt !== null && attempt !== undefined);

  return {
    date: params.window.date,
    windowStartedAt: params.window.startedAt.toISOString(),
    windowEndedAt: params.window.endedAt.toISOString(),
    providerHealthState: health.providerHealthState,
    totalScans: health.totalScans,
    succeededScans: health.succeededScans,
    failedScans: health.failedScans,
    activeScans: health.activeScans,
    rateLimitedScans: health.rateLimitedScans,
    providerUnavailableScans: health.providerUnavailableScans,
    consecutiveFailures: health.consecutiveFailures,
    schedulerDecisionCount: schedulerSummary.schedulerDecisionCount,
    schedulerEnqueuedCount: schedulerSummary.schedulerEnqueuedCount,
    schedulerSkippedCount: schedulerSummary.schedulerSkippedCount,
    schedulerSkippedByReason: schedulerSummary.schedulerSkippedByReason,
    lastSchedulerEvaluatedAt: schedulerSummary.lastSchedulerEvaluatedAt,
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

const buildSummaryView = (params: {
  readonly days: readonly SourceBindingDailyHistoryDayView[];
  readonly jobs: readonly ScanJob[];
  readonly schedulerDecisions: readonly ScanSchedulerDecisionRecord[];
  readonly attempts: ReadonlyMap<string, ScanExecutionAttemptSnapshot | null>;
}): SourceBindingDailyHistorySummaryView => {
  const snapshots = params.jobs.map((job) => job.toSnapshot());
  const health = summarizeScanProviderHealth(snapshots);
  const schedulerSummary = summarizeScanSchedulerDecisions(params.schedulerDecisions);
  const latestAttempts = snapshots
    .map((snapshot) => params.attempts.get(snapshot.id))
    .filter((attempt): attempt is NonNullable<typeof attempt> => attempt !== null && attempt !== undefined);

  return {
    providerHealthState: health.providerHealthState,
    totalScans: health.totalScans,
    succeededScans: health.succeededScans,
    failedScans: health.failedScans,
    activeScans: health.activeScans,
    rateLimitedScans: health.rateLimitedScans,
    providerUnavailableScans: health.providerUnavailableScans,
    consecutiveFailures: health.consecutiveFailures,
    schedulerDecisionCount: schedulerSummary.schedulerDecisionCount,
    schedulerEnqueuedCount: schedulerSummary.schedulerEnqueuedCount,
    schedulerSkippedCount: schedulerSummary.schedulerSkippedCount,
    schedulerSkippedByReason: schedulerSummary.schedulerSkippedByReason,
    lastSchedulerEvaluatedAt: schedulerSummary.lastSchedulerEvaluatedAt,
    fetched: sumAttempts(latestAttempts, 'fetched'),
    inserted: sumAttempts(latestAttempts, 'inserted'),
    skippedDuplicates: sumAttempts(latestAttempts, 'skippedDuplicates'),
    projected: sumAttempts(latestAttempts, 'projected'),
    daysWithScans: params.days.filter((day) => day.totalScans > 0).length,
    daysWithFailures: params.days.filter((day) => day.failedScans > 0).length,
    daysWithRateLimits: params.days.filter((day) => day.rateLimitedScans > 0).length,
    lastScanRequestedAt: snapshots[0]?.requestedAt.toISOString(),
    lastCompletedAt: snapshots
      .map((snapshot) => snapshot.completedAt)
      .find((completedAt): completedAt is Date => completedAt !== undefined)
      ?.toISOString(),
    operatorAction: health.operatorAction,
    signals: health.signals,
  };
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
