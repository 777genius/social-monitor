import { DomainError, err, ok, type Clock, type Result } from '@social-monitor/shared-kernel';

import type { ScanJob } from '../../domain';
import type {
  ScanExecutionAttemptReadPort,
  ScanJobHistoryReadPort,
  ScanJobRepositoryPort,
  ScanPolicyRepositoryPort,
  SourceBindingRepositoryPort,
} from '../../ports';
import { presentScanPolicy } from '../shared/scan-policy-presenter';
import { summarizeScanProviderHealth } from '../shared/scan-provider-health-summary';
import { buildScanStatusView } from '../shared/scan-status-view';
import { presentSourceBinding } from '../shared/source-binding-presenter';
import type { GetSourceBindingHealthQuery } from './get-source-binding-health.query';
import type {
  GetSourceBindingHealthResult,
  SourceBindingHealthFreshnessView,
  SourceBindingHealthRecentWindowView,
  SourceBindingHealthState,
} from './get-source-binding-health.result';

type GetSourceBindingHealthFailure = DomainError;
const recentScanWindowMs = 24 * 60 * 60 * 1000;
const recentScanLimit = 50;

export class GetSourceBindingHealthUseCase {
  constructor(
    private readonly sourceBindings: SourceBindingRepositoryPort,
    private readonly scanPolicies: ScanPolicyRepositoryPort,
    private readonly scanJobs: ScanJobRepositoryPort & ScanJobHistoryReadPort,
    private readonly scanExecutionAttempts: ScanExecutionAttemptReadPort,
    private readonly clock: Clock,
  ) {}

  async execute(
    query: GetSourceBindingHealthQuery,
  ): Promise<Result<GetSourceBindingHealthResult, GetSourceBindingHealthFailure>> {
    if (query.topicId.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Topic id is required'));
    }

    if (query.sourceBindingId.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Source binding id is required'));
    }

    const binding = await this.sourceBindings.findById({
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
      sourceBindingId: query.sourceBindingId,
    });

    if (binding === null || binding.toSnapshot().topicId !== query.topicId) {
      return err(new DomainError('resource.not_found', 'Source binding not found', {
        sourceBindingId: query.sourceBindingId,
      }));
    }

    const bindingSnapshot = binding.toSnapshot();
    const now = this.clock.now();
    const [scanPolicy, latestScanJob] = await Promise.all([
      this.scanPolicies.findBySourceBinding({
        tenantId: query.tenantId,
        workspaceId: query.workspaceId,
        sourceBindingId: query.sourceBindingId,
      }),
      this.scanJobs.findLatestBySourceBinding({
        tenantId: query.tenantId,
        workspaceId: query.workspaceId,
        sourceBindingId: query.sourceBindingId,
      }),
    ]);
    const recentScanJobs = await this.scanJobs.listBySourceBinding({
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
      sourceBindingId: query.sourceBindingId,
      limit: recentScanLimit,
    });
    const latestScanSnapshot = latestScanJob?.toSnapshot();
    const latestAttempt = latestScanSnapshot === undefined
      ? null
      : await this.scanExecutionAttempts.findLatestByScanJob({
          tenantId: query.tenantId,
          workspaceId: query.workspaceId,
          scanJobId: latestScanSnapshot.id,
        });
    const healthState = determineHealthState({
      bindingStatus: bindingSnapshot.status,
      hasScanPolicy: scanPolicy !== null,
      latestScanStatus: latestScanSnapshot?.status,
      freshness: scanPolicy === null || latestScanSnapshot?.completedAt === undefined
        ? undefined
        : buildFreshness({
            completedAt: latestScanSnapshot.completedAt,
            freshnessSeconds: scanPolicy.toSnapshot().freshnessSeconds,
            now,
          }),
    });

    return ok({
      sourceBinding: presentSourceBinding(binding),
      healthState,
      operatorAction: operatorActionForHealth(healthState),
      evaluatedAt: now.toISOString(),
      scanPolicy: scanPolicy === null
        ? undefined
        : {
            ...presentScanPolicy(scanPolicy),
            isDue: scanPolicy.toSnapshot().nextRunAt.getTime() <= now.getTime(),
          },
      latestScan: latestScanSnapshot === undefined
        ? undefined
        : {
            scanJobId: latestScanSnapshot.id,
            status: latestScanSnapshot.status,
            ...buildScanStatusView({
              status: latestScanSnapshot.status,
              failureReason: latestScanSnapshot.failureReason,
            }),
            requestedAt: latestScanSnapshot.requestedAt.toISOString(),
            enqueuedAt: latestScanSnapshot.enqueuedAt?.toISOString(),
            completedAt: latestScanSnapshot.completedAt?.toISOString(),
            failureReason: latestScanSnapshot.failureReason,
            latestAttempt: latestAttempt === null
              ? undefined
              : {
                  sourceBindingId: latestAttempt.sourceBindingId,
                  status: latestAttempt.status,
                  startedAt: latestAttempt.startedAt.toISOString(),
                  finishedAt: latestAttempt.finishedAt?.toISOString(),
                  fetched: latestAttempt.fetched,
                  inserted: latestAttempt.inserted,
                  skippedDuplicates: latestAttempt.skippedDuplicates,
                  projected: latestAttempt.projected,
                  failureReason: latestAttempt.failureReason,
                },
          },
      freshness: scanPolicy === null || latestScanSnapshot?.completedAt === undefined
        ? undefined
        : buildFreshness({
            completedAt: latestScanSnapshot.completedAt,
            freshnessSeconds: scanPolicy.toSnapshot().freshnessSeconds,
            now,
          }),
      recentWindow: buildRecentWindow({
        jobs: recentScanJobs.scanJobs,
        now,
      }),
    });
  }
}

const determineHealthState = (params: {
  readonly bindingStatus: 'enabled' | 'paused';
  readonly hasScanPolicy: boolean;
  readonly latestScanStatus?: 'requested' | 'enqueued' | 'succeeded' | 'failed';
  readonly freshness?: SourceBindingHealthFreshnessView;
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
    return 'degraded';
  }

  if (params.latestScanStatus === 'succeeded') {
    return params.freshness?.isFresh === true ? 'healthy' : 'stale';
  }

  return 'scheduled';
};

const buildFreshness = (params: {
  readonly completedAt: Date;
  readonly freshnessSeconds: number;
  readonly now: Date;
}): SourceBindingHealthFreshnessView => {
  const completedAtMs = params.completedAt.getTime();
  const freshnessDeadlineMs = completedAtMs + params.freshnessSeconds * 1000;
  const ageSeconds = Math.max(0, Math.floor((params.now.getTime() - completedAtMs) / 1000));
  const staleBySeconds = Math.max(0, Math.floor((params.now.getTime() - freshnessDeadlineMs) / 1000));

  return {
    isFresh: params.now.getTime() <= freshnessDeadlineMs,
    ageSeconds,
    freshnessDeadlineAt: new Date(freshnessDeadlineMs).toISOString(),
    staleBySeconds: staleBySeconds === 0 ? undefined : staleBySeconds,
  };
};

const buildRecentWindow = (params: {
  readonly jobs: readonly ScanJob[];
  readonly now: Date;
}): SourceBindingHealthRecentWindowView => {
  const windowStartedAt = new Date(params.now.getTime() - recentScanWindowMs);
  const recentJobs = params.jobs
    .map((job) => job.toSnapshot())
    .filter((job) => job.requestedAt.getTime() >= windowStartedAt.getTime());
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
): string | undefined =>
  jobs
    .map((job) => job.completedAt)
    .find((completedAt): completedAt is Date => completedAt !== undefined)
    ?.toISOString();


const operatorActionForHealth = (state: SourceBindingHealthState): string => {
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
    case 'degraded':
      return 'inspect_latest_scan_failure_and_retry_budget';
  }
};
