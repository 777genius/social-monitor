import {
  type Clock,
  DomainError,
  type IdGenerator,
  err,
  ok,
  type Result,
} from "@social-monitor/shared-kernel";

import {
  createScanPolicy,
  createSourceBinding,
  ScanAttempt,
} from "../../domain";
import {
  noopConversationProjection,
  noopSourceItemMetadataProjection,
  noopSourceItemEnrichment,
  noopSourceEngagementProjection,
  NOOP_SOURCE_CANDIDATE_MEMORY,
  type ConversationProjectionPort,
  type FeedProjectionPort,
  type ScanAttemptRepositoryPort,
  type ScanCursorRepositoryPort,
  type ScanExecutionReporterPort,
  type ScanFailureQueuePort,
  type ScanLeasePort,
  type SourceFetcherPort,
  type SourceCandidateMemoryPort,
  type SourceItemEnrichmentPort,
  type SourceItemMetadataProjectionPort,
  type SourceItemRepositoryPort,
  type SourceEngagementProjectionPort,
  type FailedScanCommand,
} from "../../ports";
import type { ExecuteScanCommand } from "./execute-scan.command";
import type { ExecuteScanResult } from "./execute-scan.result";
import {
  failedScanCollectionExecutionMetadata,
  successfulScanCollectionExecutionMetadata,
} from "./scan-collection-execution-metadata";
import { decideScanAttemptExecution } from "./scan-attempt-idempotency";
import {
  buildScanFailureMetadata,
  formatScanFailureReason,
  isProviderRateLimitFailure,
  providerFailureKind,
  shouldEnqueueScanRetry,
} from "./scan-execution-failure";
import { collectAndProjectScan } from './scan-collection-coordinator';
import { reportScanOutcome } from './scan-outcome-reporting';
import { recordScanFailure, recordedScanFailure } from './scan-failure-recording';
import { executeWithScanLease } from './execute-with-scan-lease';

type ExecuteScanFailure = DomainError | Error;

export class ExecuteScanUseCase {
  constructor(
    private readonly sourceFetcher: SourceFetcherPort,
    private readonly sourceItems: SourceItemRepositoryPort,
    private readonly feedProjection: FeedProjectionPort,
    private readonly scanAttempts: ScanAttemptRepositoryPort,
    private readonly scanCursors: ScanCursorRepositoryPort,
    private readonly scanExecutionReporter: ScanExecutionReporterPort,
    private readonly scanFailures: ScanFailureQueuePort,
    private readonly scanLeases: ScanLeasePort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly sourceItemMetadataProjection: SourceItemMetadataProjectionPort = noopSourceItemMetadataProjection,
    private readonly sourceItemEnrichment: SourceItemEnrichmentPort = noopSourceItemEnrichment,
    private readonly conversationProjection: ConversationProjectionPort = noopConversationProjection,
    private readonly candidateMemory: SourceCandidateMemoryPort = NOOP_SOURCE_CANDIDATE_MEMORY,
    private readonly sourceEngagementProjection: SourceEngagementProjectionPort = noopSourceEngagementProjection,
  ) {}

  async execute(
    command: ExecuteScanCommand,
  ): Promise<Result<ExecuteScanResult, ExecuteScanFailure>> {
    if (command.scanJobId.trim().length === 0) {
      return err(
        new DomainError("validation.failed", "Scan job id must be non-empty"),
      );
    }

    const bindingResult = createDomainValue(() =>
      createSourceBinding({
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        interestId: command.interestId,
        sourceBindingId: command.sourceBindingId,
        providerKey: command.providerKey,
      }),
    );
    if (!bindingResult.ok) {
      return err(bindingResult.error);
    }
    const policyResult = createDomainValue(() =>
      createScanPolicy({
        scanPolicyId: command.scanPolicyId,
        attemptNumber: command.attemptNumber,
        retryBudget: command.retryBudget,
        leaseTtlSeconds: command.leaseTtlSeconds,
      }),
    );
    if (!policyResult.ok) {
      return err(policyResult.error);
    }
    const sourceBinding = bindingResult.value;
    const scanPolicy = policyResult.value;
    const lease = await this.scanLeases.acquire({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      scanJobId: command.scanJobId,
      workerId: command.workerId ?? "ingestion-worker-local",
      leasedAt: this.clock.now(),
      ttlSeconds: scanPolicy.leaseTtlSeconds,
    });

    if (lease === null) {
      return err(
        new DomainError("operation.conflict", "Scan job is already leased", {
          scanJobId: command.scanJobId,
          reason: 'scan_lease_held',
        }),
      );
    }

    return executeWithScanLease(async () => {
      let attempt: ScanAttempt | undefined;
      let ingestionSucceeded = false;
      try {
        const existingAttempt = await this.scanAttempts.findByScanJob({
          tenantId: command.tenantId,
          workspaceId: command.workspaceId,
          scanJobId: command.scanJobId,
        });
        const existingSnapshot = existingAttempt?.toSnapshot();
        if (existingSnapshot?.status === 'failed' &&
            (existingSnapshot.terminalFailure === true || existingSnapshot.attemptNumber >= scanPolicy.attemptNumber)) {
          if (existingSnapshot.terminalFailure !== true && existingSnapshot.attemptNumber > scanPolicy.attemptNumber) {
            return err(recordedScanFailure(command.scanJobId, 'Stale scan attempt delivery', 'superseded'));
          }
          const recorded = await recordScanFailure(this.scanFailures,
            failedScanCommand({ ...command, ...sourceBinding },
              { ...scanPolicy, attemptNumber: existingSnapshot.attemptNumber }, existingSnapshot.failureReason!),
            existingSnapshot.terminalFailure !== true && scanPolicy.attemptNumber < scanPolicy.retryBudget);
          if (!recorded.ok) return err(recorded.error);
          if (existingSnapshot.terminalFailure !== true) {
            return err(recordedScanFailure(command.scanJobId, existingSnapshot.failureReason!, recorded.value));
          }
          const reported = await reportScanOutcome(command.scanJobId, () => this.scanExecutionReporter.reportFailed({
            tenantId: command.tenantId,
            workspaceId: command.workspaceId,
            scanJobId: command.scanJobId,
            completedAt: existingSnapshot.finishedAt!,
            failureReason: existingSnapshot.failureReason!,
          }));
          if (!reported.ok) return err(reported.error);
          return err(recordedScanFailure(command.scanJobId, existingSnapshot.failureReason!, 'dead_lettered'));
        }
        const executionDecision = decideScanAttemptExecution({
          existing: existingAttempt,
          requestedAttemptNumber: scanPolicy.attemptNumber,
        });
        if (executionDecision.kind === "replay") {
          // A previous worker may have persisted ingestion before outcome reporting failed.
          const reported = await reportScanOutcome(command.scanJobId, () => this.scanExecutionReporter.reportSucceeded({
            tenantId: command.tenantId,
            workspaceId: command.workspaceId,
            scanJobId: command.scanJobId,
            completedAt: existingAttempt!.toSnapshot().finishedAt!,
          }));
          if (!reported.ok) return err(reported.error);
          return ok(executionDecision.result);
        }
        if (executionDecision.kind === "reject") {
          return err(executionDecision.error);
        }

        const startedAttempt = ScanAttempt.start({
          scanJobId: command.scanJobId,
          tenantId: command.tenantId,
          workspaceId: command.workspaceId,
          sourceBindingId: sourceBinding.sourceBindingId,
          attemptNumber: scanPolicy.attemptNumber,
          startedAt: this.clock.now(),
        });
        await this.scanAttempts.save(startedAttempt);
        attempt = startedAttempt;

        const collected = await collectAndProjectScan(command, sourceBinding, lease, {
          sourceFetcher: this.sourceFetcher,
          sourceItems: this.sourceItems,
          feedProjection: this.feedProjection,
          scanCursors: this.scanCursors,
          sourceItemMetadataProjection: this.sourceItemMetadataProjection,
          sourceItemEnrichment: this.sourceItemEnrichment,
          conversationProjection: this.conversationProjection,
          candidateMemory: this.candidateMemory,
          sourceEngagementProjection: this.sourceEngagementProjection,
          ids: this.ids,
          clock: this.clock,
        });
        attempt = attempt.succeed({
          finishedAt: this.clock.now(),
          fetched: collected.fetched.items.length,
          inserted: collected.saveResult.inserted,
          skippedDuplicates: collected.skippedDuplicates,
          projected: collected.projectionResult.projected,
        });
        await this.scanAttempts.save(attempt);
        ingestionSucceeded = true;
        const reported = await reportScanOutcome(command.scanJobId, () => this.scanExecutionReporter.reportSucceeded({
          tenantId: command.tenantId,
          workspaceId: command.workspaceId,
          scanJobId: command.scanJobId,
          completedAt: this.clock.now(),
          warnings: collected.scanWarnings,
          collectionTelemetry: successfulScanCollectionExecutionMetadata({
            providerKey: sourceBinding.providerKey,
            sourceQuery: command.sourceQuery,
            telemetry: collected.fetched.telemetry,
            insertedItemCount: collected.saveResult.inserted,
            contentUpdatedItemCount: collected.saveResult.contentUpdated,
            engagementMetricChangedItemCount:
              collected.engagementProjectionResult.metricChanges,
            engagementObservationItemCount:
              collected.engagementProjectionResult.observationsAppended,
            engagementRetentionPurgeDeferred:
              collected.engagementProjectionResult.retentionPurgeDeferred ?? false,
            storageDuplicateItemCount: collected.saveResult.skippedDuplicates,
            candidateMemorySuppressedItemCount:
              collected.candidateScreening.suppressedExternalIds.length,
          }),
        }));
        if (!reported.ok) return err(reported.error);

        return ok({
          scanJobId: command.scanJobId,
          fetched: collected.fetched.items.length,
          inserted: collected.saveResult.inserted,
          skippedDuplicates: collected.skippedDuplicates,
          projected: collected.projectionResult.projected,
          warnings: collected.scanWarnings,
          ...(collected.fetched.telemetry === undefined
            ? {}
            : { telemetry: collected.fetched.telemetry }),
        });
      } catch (error) {
        if (attempt === undefined || ingestionSucceeded) {
          return err(
            error instanceof Error
              ? error
              : new Error("Unknown scan execution failure"),
          );
        }

        const safeFailureReason = formatScanFailureReason(error);
        const failureMetadata = buildScanFailureMetadata(error);
        const retryPending = shouldEnqueueScanRetry(error) &&
          scanPolicy.attemptNumber < scanPolicy.retryBudget;
        attempt = attempt.fail({
          finishedAt: this.clock.now(),
          failureReason: safeFailureReason,
          terminalFailure: !retryPending,
        });
        await this.scanAttempts.save(attempt);
        const recorded = await recordScanFailure(this.scanFailures,
          failedScanCommand({ ...command, ...sourceBinding }, scanPolicy, safeFailureReason), retryPending);
        if (!recorded.ok) return err(recorded.error);
        if (!retryPending) {
          const reported = await reportScanOutcome(command.scanJobId, () => this.scanExecutionReporter.reportFailed({
            tenantId: command.tenantId,
            workspaceId: command.workspaceId,
            scanJobId: command.scanJobId,
            completedAt: this.clock.now(),
            failureReason: safeFailureReason,
            failureMetadata,
            collectionTelemetry: failedScanCollectionExecutionMetadata({
              providerKey: sourceBinding.providerKey,
              sourceQuery: command.sourceQuery,
              rateLimited: isProviderRateLimitFailure(error),
              failureKind: providerFailureKind(error),
            }),
          }));
          if (!reported.ok) return err(reported.error);
        }

        return err(recordedScanFailure(command.scanJobId, safeFailureReason, recorded.value));
      }
    }, this.scanLeases, lease);
  }
}

const failedScanCommand = (command: ExecuteScanCommand,
  policy: { readonly attemptNumber: number; readonly retryBudget: number }, failureReason: string): FailedScanCommand => ({
  tenantId: command.tenantId, workspaceId: command.workspaceId, scanJobId: command.scanJobId,
  interestId: command.interestId, sourceBindingId: command.sourceBindingId,
  scanPolicyId: command.scanPolicyId, providerKey: command.providerKey,
  sourceQuery: command.sourceQuery, correlationId: command.correlationId, causationId: command.causationId,
  attemptNumber: policy.attemptNumber, retryBudget: policy.retryBudget, failureReason,
});

const createDomainValue = <T>(factory: () => T): Result<T, DomainError> => {
  try {
    return ok(factory());
  } catch (error) {
    return err(
      new DomainError(
        "validation.failed",
        error instanceof Error ? error.message : "Invalid scan command",
      ),
    );
  }
};
