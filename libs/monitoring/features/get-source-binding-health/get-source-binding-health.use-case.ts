import { DomainError, err, ok, type Clock, type Result } from '@social-monitor/shared-kernel';

import type { ScanJob } from '../../domain';
import type {
  ScanExecutionAttemptReadPort,
  ScanJobHistoryReadPort,
  ScanJobRepositoryPort,
  ScanPolicyRepositoryPort,
  SourceBindingRepositoryPort,
} from '../../ports';
import { effectiveProviderScanCadence } from '../shared/scan-cadence-policy';
import { presentScanPolicy } from '../shared/scan-policy-presenter';
import {
  boundedTransientProviderBackoffSeconds,
  providerFailureBackoffUntil,
} from '../shared/scan-freshness-guard';
import {
  scheduledScanIdempotencyKey,
} from '../shared/scan-scheduler-decision-policy';
import { summarizeScanProviderHealth } from '../shared/scan-provider-health-summary';
import { buildScanStatusView } from '../shared/scan-status-view';
import { presentSourceBinding } from '../shared/source-binding-presenter';
import type { GetSourceBindingHealthQuery } from './get-source-binding-health.query';
import {
  buildSourceBindingHealthExplanation,
  classifySourceFailureKind,
} from './source-binding-health-explanation';
import type {
  GetSourceBindingHealthResult,
  SourceBindingHealthFreshnessView,
  SourceBindingHealthRecentWindowView,
  SourceBindingHealthState,
  SourceBindingProviderHealthState,
} from './get-source-binding-health.result';
import { buildSchedulerDecision } from './source-binding-scheduler-decision';

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
    if (query.interestId.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Interest id is required'));
    }

    if (query.sourceBindingId.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Source binding id is required'));
    }

    const binding = await this.sourceBindings.findById({
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
      sourceBindingId: query.sourceBindingId,
    });

    if (binding === null || binding.toSnapshot().interestId !== query.interestId) {
      return err(new DomainError('resource.not_found', 'Source binding not found', {
        sourceBindingId: query.sourceBindingId,
      }));
    }

    const bindingSnapshot = binding.toSnapshot();
    const now = this.clock.now();
    const [scanPolicy, activeScanJob, latestScanJob] = await Promise.all([
      this.scanPolicies.findBySourceBinding({
        tenantId: query.tenantId,
        workspaceId: query.workspaceId,
        sourceBindingId: query.sourceBindingId,
      }),
      this.scanJobs.findActiveBySourceBinding({
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
    const scanPolicySnapshot = scanPolicy?.toSnapshot();
    const cadence = scanPolicySnapshot === undefined
      ? undefined
      : effectiveProviderScanCadence({
          providerKey: bindingSnapshot.providerKey,
          intervalSeconds: scanPolicySnapshot.intervalSeconds,
          freshnessSeconds: scanPolicySnapshot.freshnessSeconds,
        });
    const freshness = scanPolicySnapshot === undefined || latestScanSnapshot?.completedAt === undefined
      ? undefined
      : buildFreshness({
          completedAt: latestScanSnapshot.completedAt,
          freshnessSeconds: cadence?.freshnessSeconds ?? scanPolicySnapshot.freshnessSeconds,
          now,
        });
    const duplicateScheduledScan = scanPolicySnapshot === undefined
      ? null
      : await this.scanJobs.findByIdempotencyKey({
          tenantId: query.tenantId,
          workspaceId: query.workspaceId,
          idempotencyKey: scheduledScanIdempotencyKey(
            scanPolicySnapshot.id,
            scanPolicySnapshot.nextRunAt,
          ),
        });
    const providerFailureBackoff = cadence === undefined
      ? null
      : providerFailureBackoffUntil({
          recentJobs: recentScanJobs.scanJobs,
          backoffSeconds: boundedTransientProviderBackoffSeconds({
            intervalSeconds: cadence.intervalSeconds,
          }),
          now,
        });
    const latestAttempt = latestScanSnapshot === undefined
      ? null
      : await this.scanExecutionAttempts.findLatestByScanJob({
          tenantId: query.tenantId,
          workspaceId: query.workspaceId,
          scanJobId: latestScanSnapshot.id,
        });
    const recentWindow = buildRecentWindow({
      jobs: recentScanJobs.scanJobs,
      now,
    });
    const latestScanStatusView = latestScanSnapshot === undefined
      ? undefined
      : buildScanStatusView({
          status: latestScanSnapshot.status,
          failureReason: latestScanSnapshot.failureReason,
          failureMetadata: latestScanSnapshot.failureMetadata,
        });
    const healthState = determineHealthState({
      bindingStatus: bindingSnapshot.status,
      hasScanPolicy: scanPolicy !== null,
      latestScanStatus: latestScanSnapshot?.status,
      latestFailureKind: latestScanStatusView === undefined
        ? undefined
        : classifySourceFailureKind({
            failureClass: latestScanStatusView.failureClass,
            failureReason: latestScanSnapshot?.failureReason,
            failureMetadata: latestScanSnapshot?.failureMetadata,
          }),
      freshness,
      recentProviderHealthState: recentWindow.providerHealthState,
    });
    const operatorAction = operatorActionForHealth(healthState);
    const schedulerDecision = buildSchedulerDecision({
      bindingStatus: bindingSnapshot.status,
      providerKey: bindingSnapshot.providerKey,
      scanPolicySnapshot,
      activeScanJob,
      duplicateScheduledScan,
      latestScanJob,
      freshness,
      cadence,
      providerFailureBackoff,
      now,
    });
    const latestScan = latestScanSnapshot === undefined || latestScanStatusView === undefined
      ? undefined
      : {
          scanJobId: latestScanSnapshot.id,
          status: latestScanSnapshot.status,
          ...latestScanStatusView,
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
        };

    return ok({
      sourceBinding: presentSourceBinding(binding),
      healthState,
      operatorAction,
      healthExplanation: buildSourceBindingHealthExplanation({
        providerKey: bindingSnapshot.providerKey,
        healthState,
        operatorAction,
        schedulerDecision,
        freshness,
        latestFailureClass: latestScanStatusView?.failureClass,
        latestFailureReason: latestScanSnapshot?.failureReason,
        recentWindow,
      }),
      evaluatedAt: now.toISOString(),
      schedulerDecision,
      scanPolicy: scanPolicy === null || scanPolicySnapshot === undefined
        ? undefined
        : {
            ...presentScanPolicy(scanPolicy, { providerKey: bindingSnapshot.providerKey }),
            isDue: scanPolicySnapshot.nextRunAt.getTime() <= now.getTime(),
          },
      latestScan,
      freshness,
      recentWindow,
    });
  }
}

const determineHealthState = (params: {
  readonly bindingStatus: 'enabled' | 'paused';
  readonly hasScanPolicy: boolean;
  readonly latestScanStatus?: 'requested' | 'enqueued' | 'succeeded' | 'failed';
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
