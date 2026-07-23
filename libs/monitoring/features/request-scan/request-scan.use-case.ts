import {
  type Clock,
  DomainError,
  type IdGenerator,
  causationId,
  correlationId,
  eventId,
  err,
  ok,
  type Result,
} from '@social-monitor/shared-kernel';

import { ScanJob, type ScanRequestedEvent } from '../../domain';
import type {
  IdempotencyPort,
  OutboxPort,
  ScanJobHistoryReadPort,
  ScanJobRepositoryPort,
  ScanDispatchPort,
  ScanPolicyRepositoryPort,
  ScanRequestQuotaPort,
  ScanQueuePort,
  SourceBindingRepositoryPort,
} from '../../ports';
import type { RequestScanCommand } from './request-scan.command';
import type { RequestScanDecisionView, RequestScanResult } from './request-scan.result';
import { effectiveProviderScanCadence } from '../shared/scan-cadence-policy';
import {
  boundedTransientProviderBackoffSeconds,
  isFreshSuccessfulScan,
  providerFailureBackoffUntil,
  rateLimitBackoffUntil,
} from '../shared/scan-freshness-guard';
import { summarizeScanProviderHealth } from '../shared/scan-provider-health-summary';
import { sourceBindingScanQuery } from '../shared/source-binding-scan-query';

type RequestScanFailure = DomainError | Error;
type ScanJobRecentHistoryReadPort = Pick<ScanJobHistoryReadPort, 'listBySourceBinding'>;

export class RequestScanUseCase {
  constructor(
    private readonly sourceBindings: SourceBindingRepositoryPort,
    private readonly scanPolicies: ScanPolicyRepositoryPort,
    private readonly scanJobs: ScanJobRepositoryPort & ScanJobRecentHistoryReadPort,
    private readonly scanQueue: ScanQueuePort,
    private readonly outbox: OutboxPort,
    private readonly idempotency: IdempotencyPort,
    private readonly scanRequestQuota: ScanRequestQuotaPort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly scanDispatch?: ScanDispatchPort,
  ) {}

  async execute(command: RequestScanCommand): Promise<Result<RequestScanResult, RequestScanFailure>> {
    const cached = await this.idempotency.get<RequestScanResult>({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      scope: 'monitoring.request-scan',
      key: command.idempotencyKey,
    });
    if (cached) {
      return ok(withRequestDecision({
        scanJobId: cached.value.scanJobId,
        status: cached.value.status,
        created: false,
        requestDecision: idempotentReplayDecision(),
      }));
    }

    const existingJob = await this.scanJobs.findByIdempotencyKey({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      idempotencyKey: command.idempotencyKey,
    });
    if (existingJob) {
      const snapshot = existingJob.toSnapshot();
      const result = withRequestDecision({
        scanJobId: snapshot.id,
        status: snapshot.status,
        created: false,
        requestDecision: idempotentReplayDecision(),
      });
      await this.cacheResult(command, result);
      return ok(result);
    }

    const binding = await this.sourceBindings.findById({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      sourceBindingId: command.sourceBindingId,
    });
    if (!binding) {
      return err(new DomainError('resource.not_found', 'Source binding not found', { sourceBindingId: command.sourceBindingId }));
    }
    const bindingSnapshot = binding.toSnapshot();

    if (bindingSnapshot.status !== 'enabled') {
      return err(new DomainError('validation.failed', 'Source binding is paused and cannot accept new scan requests', {
        sourceBindingId: command.sourceBindingId,
        status: bindingSnapshot.status,
      }));
    }

    const policy = await this.scanPolicies.findBySourceBinding({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      sourceBindingId: command.sourceBindingId,
    });
    if (!policy) {
      return err(new DomainError('validation.failed', 'Scan policy must be set before requesting a scan', {
        sourceBindingId: command.sourceBindingId,
      }));
    }

    const activeJob = await this.scanJobs.findActiveBySourceBinding({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      sourceBindingId: command.sourceBindingId,
    });
    if (activeJob !== null) {
      const snapshot = activeJob.toSnapshot();
      const result = withRequestDecision({
        scanJobId: snapshot.id,
        status: snapshot.status,
        created: false,
        requestDecision: {
          decision: 'active_scan',
          reason: 'scan_already_in_progress',
          createdNewScan: false,
          signals: ['active_scan_in_progress'],
        },
      });
      await this.cacheResult(command, result);
      return ok(result);
    }

    const policySnapshot = policy.toSnapshot();
    const now = this.clock.now();
    const latestJob = await this.scanJobs.findLatestBySourceBinding({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      sourceBindingId: command.sourceBindingId,
    });
    const recentJobs = await this.scanJobs.listBySourceBinding({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      sourceBindingId: command.sourceBindingId,
      limit: 5,
    });
    const cadence = effectiveProviderScanCadence({
      providerKey: bindingSnapshot.providerKey,
      intervalSeconds: policySnapshot.intervalSeconds,
      freshnessSeconds: policySnapshot.freshnessSeconds,
    });
    if (latestJob !== null && isFreshSuccessfulScan({
      latestJob,
      freshnessSeconds: cadence.freshnessSeconds,
      now,
    })) {
      const snapshot = latestJob.toSnapshot();
      const freshnessDeadlineAt = snapshot.completedAt === undefined
        ? undefined
        : new Date(snapshot.completedAt.getTime() + cadence.freshnessSeconds * 1000).toISOString();
      const result = withRequestDecision({
        scanJobId: snapshot.id,
        status: snapshot.status,
        created: false,
        requestDecision: {
          decision: 'fresh_success',
          reason: 'latest_success_still_fresh',
          createdNewScan: false,
          ...cadenceDecisionFields(policySnapshot, cadence),
          nextEligibleAt: freshnessDeadlineAt,
          waitSeconds: secondsUntil(freshnessDeadlineAt, now),
          freshnessDeadlineAt,
          signals: cadenceSignals('fresh_success', cadence.providerMinimumIntervalEnforced),
        },
      });
      await this.cacheResult(command, result);
      return ok(result);
    }
    const transientProviderBackoffSeconds = boundedTransientProviderBackoffSeconds({
      intervalSeconds: cadence.intervalSeconds,
    });
    const rateLimitBackoff = rateLimitBackoffUntil({
      latestJob,
      backoffSeconds: transientProviderBackoffSeconds,
      now,
    });
    if (latestJob !== null && rateLimitBackoff !== null) {
      const snapshot = latestJob.toSnapshot();
      const rateLimitBackoffUntil = rateLimitBackoff.toISOString();
      const providerHealth = summarizeScanProviderHealth(providerHealthInputs(recentJobs.scanJobs));
      const result = withRequestDecision({
        scanJobId: snapshot.id,
        status: snapshot.status,
        created: false,
        requestDecision: {
          decision: 'rate_limit_backoff',
          reason: 'provider_rate_limit_backoff_active',
          createdNewScan: false,
          ...cadenceDecisionFields(policySnapshot, cadence),
          nextEligibleAt: rateLimitBackoffUntil,
          waitSeconds: secondsUntil(rateLimitBackoffUntil, now),
          rateLimitBackoffUntil,
          providerHealthState: providerHealth.providerHealthState,
          signals: cadenceSignals('rate_limit_backoff', cadence.providerMinimumIntervalEnforced),
        },
      });
      await this.cacheResult(command, result);
      return ok(result);
    }
    const providerFailureBackoff = providerFailureBackoffUntil({
      recentJobs: recentJobs.scanJobs,
      backoffSeconds: transientProviderBackoffSeconds,
      now,
    });
    if (latestJob !== null && providerFailureBackoff !== null) {
      const snapshot = latestJob.toSnapshot();
      const providerFailureBackoffUntilIso = providerFailureBackoff.toISOString();
      const providerHealth = summarizeScanProviderHealth(providerHealthInputs(recentJobs.scanJobs));
      const result = withRequestDecision({
        scanJobId: snapshot.id,
        status: snapshot.status,
        created: false,
        requestDecision: {
          decision: 'provider_failure_backoff',
          reason: 'provider_failure_backoff_active',
          createdNewScan: false,
          ...cadenceDecisionFields(policySnapshot, cadence),
          nextEligibleAt: providerFailureBackoffUntilIso,
          waitSeconds: secondsUntil(providerFailureBackoffUntilIso, now),
          providerFailureBackoffUntil: providerFailureBackoffUntilIso,
          providerHealthState: providerHealth.providerHealthState,
          signals: cadenceSignals('provider_failure_backoff', cadence.providerMinimumIntervalEnforced),
        },
      });
      await this.cacheResult(command, result);
      return ok(result);
    }

    const queueCommand = {
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      scanJobId: this.ids.generate(),
      interestId: bindingSnapshot.interestId,
      sourceBindingId: command.sourceBindingId,
      scanPolicyId: policySnapshot.id,
      providerKey: bindingSnapshot.providerKey,
      sourceQuery: sourceBindingScanQuery(bindingSnapshot),
      retryBudget: policySnapshot.retryBudget,
      correlationId: command.correlationId,
      causationId: command.idempotencyKey,
    };
    if (!(await this.scanQueue.canAccept(queueCommand))) {
      return err(new DomainError('operation.backpressure', 'Scan queue backpressure limit reached', {
        sourceBindingId: command.sourceBindingId,
      }));
    }

    const quota = await this.scanRequestQuota.reserveManualScanRequest({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      sourceBindingId: command.sourceBindingId,
    });
    if (!quota.ok) {
      return err(quota.error);
    }

    const job = ScanJob.request({
      id: queueCommand.scanJobId,
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      sourceBindingId: command.sourceBindingId,
      scanPolicyId: policySnapshot.id,
      idempotencyKey: command.idempotencyKey,
      requestedAt: now,
    });
    const snapshot = job.toSnapshot();

    const event: ScanRequestedEvent = {
      eventId: eventId(this.ids.generate()),
      eventType: 'monitoring.scan.requested',
      schemaVersion: 1,
      occurredAt: now,
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      correlationId: correlationId(command.correlationId),
      causationId: causationId(command.idempotencyKey),
      payload: {
        scanJobId: snapshot.id,
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        sourceBindingId: snapshot.sourceBindingId,
        scanPolicyId: snapshot.scanPolicyId,
        providerKey: bindingSnapshot.providerKey,
      },
    };
    const enqueuedJob = job.markEnqueued({ enqueuedAt: now });
    if (this.scanDispatch === undefined) {
      await this.scanJobs.save(job);
      await this.outbox.append(event);
      await this.scanQueue.enqueue(queueCommand);
      await this.scanJobs.save(enqueuedJob);
    } else {
      await this.scanDispatch.storeEnqueuedScan({
        job: enqueuedJob,
        command: queueCommand,
        event,
      });
    }

    const result = withRequestDecision({
      scanJobId: snapshot.id,
      status: enqueuedJob.toSnapshot().status,
      created: true,
      requestDecision: {
        decision: 'created',
        reason: 'manual_scan_enqueued',
        createdNewScan: true,
        ...cadenceDecisionFields(policySnapshot, cadence),
        signals: ['manual_scan_enqueued'],
      },
    });
    await this.cacheResult(command, result);
    return ok(result);
  }

  private async cacheResult(command: RequestScanCommand, result: RequestScanResult): Promise<void> {
    await this.idempotency.set({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      scope: 'monitoring.request-scan',
      key: command.idempotencyKey,
      value: result,
    });
  }
}

const withRequestDecision = (result: RequestScanResult): RequestScanResult => result;

const idempotentReplayDecision = (): RequestScanDecisionView => ({
  decision: 'idempotent_replay',
  reason: 'idempotency_key_reused',
  createdNewScan: false,
  signals: ['idempotent_replay'],
});

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

const providerHealthInputs = (
  jobs: readonly ScanJob[],
): Parameters<typeof summarizeScanProviderHealth>[0] =>
  jobs.map((job) => {
    const snapshot = job.toSnapshot();

    return {
      status: snapshot.status,
      failureReason: snapshot.failureReason,
      failureMetadata: snapshot.failureMetadata,
    };
  });

const cadenceDecisionFields = (
  policySnapshot: { readonly intervalSeconds: number },
  cadence: ReturnType<typeof effectiveProviderScanCadence>,
) => ({
  minimumIntervalSeconds: cadence.minimumIntervalSeconds,
  configuredIntervalSeconds: policySnapshot.intervalSeconds,
  effectiveIntervalSeconds: cadence.intervalSeconds,
  freshnessSeconds: cadence.freshnessSeconds,
  providerMinimumIntervalEnforced: cadence.providerMinimumIntervalEnforced,
});
