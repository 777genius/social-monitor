import { DomainError, err, ok, type Clock, type Result } from '@social-monitor/shared-kernel';

import type { ScanJob, ScanPolicy, SourceBinding } from '../../domain';
import type {
  ScanExecutionAttemptReadPort,
  ScanJobHistoryReadPort,
  ScanPolicyRepositoryPort,
  SourceBindingRepositoryPort,
  TopicRepositoryPort,
} from '../../ports';
import type { ListTopicSourceDailyHistoryQuery } from './list-topic-source-daily-history.query';
import type {
  ListTopicSourceDailyHistoryResult,
} from './list-topic-source-daily-history.result';
import {
  buildTopicSourceDailyHistoryDayView,
  buildTopicSourceDailyHistorySummaryView,
} from './topic-source-daily-history-presenter';

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
    const days = windows.map((window) => buildTopicSourceDailyHistoryDayView({
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
      summary: buildTopicSourceDailyHistorySummaryView({
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
