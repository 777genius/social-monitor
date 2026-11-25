import {
  type Clock,
  DomainError,
  type IdGenerator,
  err,
  ok,
  type Result,
} from '@social-monitor/shared-kernel';

import { prepareScanDispatch } from '../../application/scan-dispatch-plan';
import type {
  IdempotencyPort,
  ScanJobHistoryReadPort,
  ScanJobRepositoryPort,
  ScanDispatchPort,
  ScanPolicyRepositoryPort,
  ScanRequestQuotaPort,
  ScanQueuePort,
  SourceBindingRepositoryPort,
} from '../../ports';
import type { RequestScanCommand } from './request-scan.command';
import type { RequestScanResult } from './request-scan.result';
import { effectiveProviderScanCadence } from '../../domain/policies/provider-scan-cadence';
import { evaluateManualScanAdmission } from '../../domain/policies/scan-admission-policy';
import { summarizeScanProviderHealth } from '../shared/scan-provider-health-summary';
import { sourceBindingScanQuery } from '../shared/source-binding-scan-query';
import { cadenceDecisionFields, idempotentReplayDecision, presentSuppressedScanRequest } from './request-scan-decision.presenter';

type RequestScanFailure = DomainError | Error;
type ScanJobRecentHistoryReadPort = Pick<ScanJobHistoryReadPort, 'listBySourceBinding'>;

export class RequestScanUseCase {
  constructor(
    private readonly sourceBindings: SourceBindingRepositoryPort,
    private readonly scanPolicies: ScanPolicyRepositoryPort,
    private readonly scanJobs: Omit<ScanJobRepositoryPort, 'save'> & ScanJobRecentHistoryReadPort,
    private readonly scanQueue: Pick<ScanQueuePort, 'canAccept'>,
    private readonly scanDispatch: ScanDispatchPort,
    private readonly idempotency: IdempotencyPort,
    private readonly scanRequestQuota: ScanRequestQuotaPort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(command: RequestScanCommand): Promise<Result<RequestScanResult, RequestScanFailure>> {
    const cached = await this.idempotency.get<RequestScanResult>({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      scope: 'monitoring.request-scan',
      key: command.idempotencyKey,
    });
    if (cached) {
      return ok({
        scanJobId: cached.value.scanJobId,
        status: cached.value.status,
        created: false,
        requestDecision: idempotentReplayDecision(),
      });
    }

    const existingJob = await this.scanJobs.findByIdempotencyKey({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      idempotencyKey: command.idempotencyKey,
    });
    if (existingJob) {
      const snapshot = existingJob.toSnapshot();
      const result: RequestScanResult = {
        scanJobId: snapshot.id,
        status: snapshot.status,
        created: false,
        requestDecision: idempotentReplayDecision(),
      };
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
      const result: RequestScanResult = {
        scanJobId: snapshot.id,
        status: snapshot.status,
        created: false,
        requestDecision: {
          decision: 'active_scan',
          reason: 'scan_already_in_progress',
          createdNewScan: false,
          signals: ['active_scan_in_progress'],
        },
      };
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
    const admission = evaluateManualScanAdmission({
      activeScan: false,
      latestJob: latestJob?.toSnapshot() ?? null,
      recentJobs: recentJobs.scanJobs.map((job) => job.toSnapshot()),
      cadence,
      now,
    });
    const suppressedDecision = presentSuppressedScanRequest({
      admission,
      cadence,
      configuredIntervalSeconds: policySnapshot.intervalSeconds,
      providerHealthState: summarizeScanProviderHealth(recentJobs.scanJobs.map((job) => job.toSnapshot())).providerHealthState,
      now,
    });
    if (latestJob !== null && suppressedDecision !== null) {
      const snapshot = latestJob.toSnapshot();
      const result: RequestScanResult = {
        scanJobId: snapshot.id,
        status: snapshot.status,
        created: false,
        requestDecision: suppressedDecision,
      };
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

    const dispatch = prepareScanDispatch({
      command: queueCommand,
      idempotencyKey: command.idempotencyKey,
      requestedAt: now,
      requestedEventId: this.ids.generate(),
    });
    await this.scanDispatch.storeEnqueuedScan(dispatch);
    const snapshot = dispatch.job.toSnapshot();

    const result: RequestScanResult = {
      scanJobId: snapshot.id,
      status: snapshot.status,
      created: true,
      requestDecision: {
        decision: 'created',
        reason: 'manual_scan_enqueued',
        createdNewScan: true,
        ...cadenceDecisionFields(policySnapshot, cadence),
        signals: ['manual_scan_enqueued'],
      },
    };
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
