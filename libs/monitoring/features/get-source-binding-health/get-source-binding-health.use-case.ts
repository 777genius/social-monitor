import { DomainError, err, ok, type Clock, type Result } from '@social-monitor/shared-kernel';

import type { ScanJob } from '../../domain';
import type {
  ScanExecutionAttemptReadPort,
  ScanJobHistoryReadPort,
  ScanJobRepositoryPort,
  ScanPolicyRepositoryPort,
  SourceBindingRepositoryPort,
} from '../../ports';
import {
  effectiveProviderScanCadence,
  minimumScanIntervalSecondsForProvider,
  type EffectiveProviderScanCadence,
} from '../shared/scan-cadence-policy';
import { presentScanPolicy } from '../shared/scan-policy-presenter';
import {
  isFreshSuccessfulScan,
  providerFailureBackoffUntil,
  rateLimitBackoffUntil,
} from '../shared/scan-freshness-guard';
import { summarizeScanProviderHealth } from '../shared/scan-provider-health-summary';
import { buildScanStatusView } from '../shared/scan-status-view';
import { presentSourceBinding } from '../shared/source-binding-presenter';
import type { GetSourceBindingHealthQuery } from './get-source-binding-health.query';
import type {
  GetSourceBindingHealthResult,
  SourceBindingHealthFreshnessView,
  SourceBindingHealthRecentWindowView,
  SourceBindingHealthSchedulerDecisionView,
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
    const providerFailureBackoff = cadence === undefined
      ? null
      : providerFailureBackoffUntil({
          recentJobs: recentScanJobs.scanJobs,
          backoffSeconds: cadence.intervalSeconds,
          now,
        });
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
      freshness,
    });

    return ok({
      sourceBinding: presentSourceBinding(binding),
      healthState,
      operatorAction: operatorActionForHealth(healthState),
      evaluatedAt: now.toISOString(),
      schedulerDecision: buildSchedulerDecision({
        bindingStatus: bindingSnapshot.status,
        providerKey: bindingSnapshot.providerKey,
        scanPolicySnapshot,
        activeScanJob,
        latestScanJob,
        freshness,
        cadence,
        providerFailureBackoff,
        now,
      }),
      scanPolicy: scanPolicy === null || scanPolicySnapshot === undefined
        ? undefined
        : {
            ...presentScanPolicy(scanPolicy, { providerKey: bindingSnapshot.providerKey }),
            isDue: scanPolicySnapshot.nextRunAt.getTime() <= now.getTime(),
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
      freshness,
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

const buildSchedulerDecision = (params: {
  readonly bindingStatus: 'enabled' | 'paused';
  readonly providerKey: string;
  readonly scanPolicySnapshot?: {
    readonly intervalSeconds: number;
    readonly freshnessSeconds: number;
    readonly nextRunAt: Date;
  };
  readonly activeScanJob: ScanJob | null;
  readonly latestScanJob: ScanJob | null;
  readonly freshness?: SourceBindingHealthFreshnessView;
  readonly cadence?: EffectiveProviderScanCadence;
  readonly providerFailureBackoff: Date | null;
  readonly now: Date;
}): SourceBindingHealthSchedulerDecisionView => {
  const minimumIntervalSeconds = params.cadence?.minimumIntervalSeconds ??
    minimumScanIntervalSecondsForProvider(params.providerKey);
  const base = {
    minimumIntervalSeconds,
    configuredIntervalSeconds: params.scanPolicySnapshot?.intervalSeconds,
    freshnessSeconds: params.cadence?.freshnessSeconds ?? params.scanPolicySnapshot?.freshnessSeconds,
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

  if (params.activeScanJob !== null) {
    return {
      ...base,
      canScanNow: false,
      decision: 'active_scan',
      reason: 'scan_already_in_progress',
      signals: ['active_scan_in_progress'],
    };
  }

  if (isFreshSuccessfulScan({
    latestJob: params.latestScanJob,
    freshnessSeconds: params.cadence?.freshnessSeconds ?? params.scanPolicySnapshot.freshnessSeconds,
    now: params.now,
  })) {
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

  const rateLimitBackoff = rateLimitBackoffUntil({
    latestJob: params.latestScanJob,
    backoffSeconds: params.cadence?.intervalSeconds ?? params.scanPolicySnapshot.intervalSeconds,
    now: params.now,
  });
  if (rateLimitBackoff !== null) {
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

  if (params.providerFailureBackoff !== null) {
    const backoffUntil = params.providerFailureBackoff.toISOString();

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
