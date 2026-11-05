import { DomainError, err, ok, type Clock, type Result } from '@social-monitor/shared-kernel';

import type {
  ScanExecutionAttemptReadPort,
  ScanJobHistoryReadPort,
  ScanJobRepositoryPort,
  ScanPolicyRepositoryPort,
  SourceBindingRepositoryPort,
} from '../../ports';
import { effectiveProviderScanCadence } from '../../domain/policies/provider-scan-cadence';
import { presentScanPolicy } from '../shared/scan-policy-presenter';
import { evaluateScheduledScanAdmission } from '../../domain/policies/scan-admission-policy';
import {
  scheduledScanIdempotencyKey,
} from '../../domain/policies/scan-schedule-policy';
import { buildScanStatusView } from '../shared/scan-status-view';
import { presentSourceBinding } from '../shared/source-binding-presenter';
import type { GetSourceBindingHealthQuery } from './get-source-binding-health.query';
import {
  buildSourceBindingHealthExplanation,
  classifySourceFailureKind,
} from './source-binding-health-explanation';
import {
  buildFreshness,
  buildRecentWindow,
  determineHealthState,
  operatorActionForHealth,
} from './source-binding-health-evaluation';
import type { GetSourceBindingHealthResult } from './get-source-binding-health.result';
import { buildSchedulerDecision } from './source-binding-scheduler-decision';

type GetSourceBindingHealthFailure = DomainError;
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
    // Preserve elapsed-time evidence after a failed scan; health state still
    // classifies failed scans separately instead of treating them as healthy.
    const freshness = scanPolicySnapshot === undefined ||
      latestScanSnapshot?.completedAt === undefined
      ? undefined
      : buildFreshness({
          completedAt: latestScanSnapshot.completedAt,
          collectionComplete: latestScanSnapshot.executionMetadata?.collectionComplete !== false,
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
    const admission = cadence === undefined ? undefined : evaluateScheduledScanAdmission({
      activeScan: activeScanJob !== null,
      duplicateWindow: duplicateScheduledScan !== null && scanPolicySnapshot !== undefined &&
        scanPolicySnapshot.nextRunAt.getTime() <= now.getTime(),
      latestJob: latestScanSnapshot ?? null,
      recentJobs: recentScanJobs.scanJobs.map((job) => job.toSnapshot()),
      cadence,
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
        executionMetadata: latestScanSnapshot.executionMetadata,
        });
    const healthState = determineHealthState({
      bindingStatus: bindingSnapshot.status,
      hasScanPolicy: scanPolicy !== null,
      latestScanStatus: latestScanSnapshot?.status,
      latestCollectionComplete: latestScanSnapshot?.executionMetadata?.collectionComplete !== false,
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
    const operatorAction = healthState === 'degraded' && latestScanSnapshot?.status === 'succeeded' && latestScanStatusView?.userState === 'scan_degraded'
      ? latestScanStatusView.operatorAction
      : operatorActionForHealth(healthState);
    const schedulerDecision = buildSchedulerDecision({
      bindingStatus: bindingSnapshot.status,
      providerKey: bindingSnapshot.providerKey,
      scanPolicySnapshot,
      admission,
      freshness,
      cadence,
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

