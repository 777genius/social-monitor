import { persistScannedSourceItems } from './persist-scanned-source-items';
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
  githubTrendingSnapshotBatchObservedAt,
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
import {
  sanitizeAndPrepareLiveArticleFetchUrls,
  sanitizeFetchedConversationUnit,
  sanitizeSourceWarnings,
} from "./scan-source-sanitization";
import {
  rememberProcessedSourceCandidates,
  screenSourceCandidates,
} from "./source-candidate-memory-coordinator";
import { prepareSourceEngagementSamples } from "./source-engagement-sample-coordinator";
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

        const existingCursor = await this.scanCursors.findBySourceBinding({
          tenantId: command.tenantId,
          workspaceId: command.workspaceId,
          sourceBindingId: sourceBinding.sourceBindingId,
        });
        const fetched = await this.sourceFetcher.fetch({
          tenantId: command.tenantId,
          workspaceId: command.workspaceId,
          sourceBindingId: sourceBinding.sourceBindingId,
          scanJobId: command.scanJobId,
          providerKey: sourceBinding.providerKey,
          sourceQuery: command.sourceQuery,
          correlationId: command.correlationId,
          cursor: existingCursor?.cursor,
        });
        const scanWarnings = [...sanitizeSourceWarnings(fetched.warnings)];

        const ingestedAt = this.clock.now();
        const { sanitizedFetchedItems, liveArticleFetchUrls } =
          sanitizeAndPrepareLiveArticleFetchUrls(
            sourceBinding.providerKey,
            fetched.items,
          );
        const candidateScreening = await screenSourceCandidates({
          memory: this.candidateMemory,
          scope: {
            tenantId: command.tenantId,
            workspaceId: command.workspaceId,
            interestId: sourceBinding.interestId,
            sourceBindingId: sourceBinding.sourceBindingId,
            providerKey: sourceBinding.providerKey,
            interestQuery: command.interestQuerySnapshot,
            sourceQuery: command.sourceQuery,
          },
          items: sanitizedFetchedItems,
          screenedAt: ingestedAt,
        });
        if (candidateScreening.warning !== undefined) {
          scanWarnings.push(candidateScreening.warning);
        }
        const { enriched, saveResult, persistedItems } = await persistScannedSourceItems({
          scope: { tenantId: command.tenantId, workspaceId: command.workspaceId,
            sourceBindingId: sourceBinding.sourceBindingId, providerKey: sourceBinding.providerKey },
          repository: this.sourceItems, enrichment: this.sourceItemEnrichment,
          items: sanitizedFetchedItems, screening: candidateScreening, capturedAt: ingestedAt,
          clock: this.clock, ids: this.ids, lease, correlationId: command.correlationId,
          liveArticleFetchUrls,
        });
        const projectionObservedAt =
          githubTrendingSnapshotBatchObservedAt({
            providerKey: sourceBinding.providerKey,
            items: persistedItems.map((item) => item.toSnapshot()),
          }) ?? ingestedAt;
        const { sourceItemsForFullProjection, engagementSamples } =
          prepareSourceEngagementSamples({
            providerKey: sourceBinding.providerKey,
            persistedItems,
            savedItems: saveResult.items,
            candidateScreening,
          });
        const projectionResult = sourceItemsForFullProjection.length === 0
          ? { projected: 0, projectedItems: [] }
          : await this.feedProjection.project({
              tenantId: command.tenantId,
              workspaceId: command.workspaceId,
              interestId: sourceBinding.interestId,
              sourceBindingId: sourceBinding.sourceBindingId,
              providerKey: sourceBinding.providerKey,
              snapshots: {
                interestQuerySnapshot: {
                  interestId: sourceBinding.interestId,
                  query:
                    command.interestQuerySnapshot ?? command.sourceQuery.query,
                },
                sourceBindingSnapshot: {
                  sourceBindingId: sourceBinding.sourceBindingId,
                  providerKey: sourceBinding.providerKey,
                  sourceQuery: {
                    mode: command.sourceQuery.mode,
                    query: command.sourceQuery.query,
                  },
                },
                workspaceScopeSnapshot: {
                  tenantId: command.tenantId,
                  workspaceId: command.workspaceId,
                },
              },
              sourceItems: sourceItemsForFullProjection,
            });
        if (sourceItemsForFullProjection.length > 0 || (fetched.conversationUnits?.length ?? 0) > 0) {
          const conversationResult = await this.conversationProjection.project({
            tenantId: command.tenantId,
            workspaceId: command.workspaceId,
            interestId: sourceBinding.interestId,
            sourceBindingId: sourceBinding.sourceBindingId,
            providerKey: sourceBinding.providerKey,
            observedAt: projectionObservedAt,
            conversationUnits: (fetched.conversationUnits ?? []).map(
              sanitizeFetchedConversationUnit,
            ),
            projectedFeedItems: projectionResult.projectedItems,
          });
          if (
            fetched.telemetry?.targetPublishedWindowStartedAt !== undefined &&
            fetched.telemetry.targetPublishedWindowEndedAt !== undefined &&
            (conversationResult.skippedInvalid > 0 || conversationResult.skippedOrphans > 0)
          ) {
            const incompleteProjection = new DomainError(
              "external.dependency_unavailable",
              `Historical conversation projection incomplete: ${conversationResult.skippedInvalid} invalid and ${conversationResult.skippedOrphans} orphan units skipped`,
              {
                skippedInvalid: conversationResult.skippedInvalid,
                skippedOrphans: conversationResult.skippedOrphans,
              },
            );
            throw incompleteProjection;
          }
        }
        if (sourceItemsForFullProjection.length > 0) {
          await this.sourceItemMetadataProjection.project({
            tenantId: command.tenantId,
            workspaceId: command.workspaceId,
            interestId: sourceBinding.interestId,
            sourceBindingId: sourceBinding.sourceBindingId,
            scanJobId: command.scanJobId,
            providerKey: sourceBinding.providerKey,
            sourceItems: sourceItemsForFullProjection,
          });
        }
        const engagementProjectionResult =
          await this.sourceEngagementProjection.project({
            tenantId: command.tenantId,
            workspaceId: command.workspaceId,
            sourceBindingId: sourceBinding.sourceBindingId,
            scanJobId: command.scanJobId,
            providerKey: sourceBinding.providerKey,
            observedAt: projectionObservedAt,
            samples: engagementSamples,
          });
        if (fetched.nextCursor !== undefined) {
          await this.scanCursors.save({
            tenantId: command.tenantId,
            workspaceId: command.workspaceId,
            sourceBindingId: sourceBinding.sourceBindingId,
            cursor: fetched.nextCursor,
            committedAt: this.clock.now(),
          });
        }
        const candidateMemoryWriteWarning =
          await rememberProcessedSourceCandidates({
            memory: this.candidateMemory,
            screening: candidateScreening,
            processedExternalIds: new Set(
              [
                ...enriched.items.map((item) => item.externalId),
                ...engagementSamples.map((sample) => sample.externalId),
              ],
            ),
            rememberedAt: this.clock.now(),
          });
        if (candidateMemoryWriteWarning !== undefined) {
          scanWarnings.push(candidateMemoryWriteWarning);
        }
        const skippedDuplicates = new Set([
          ...saveResult.items
            .filter((item) => item.mutationKind === "unchanged")
            .map((item) => item.externalId),
          ...candidateScreening.suppressedExternalIds,
        ]).size;
        attempt = attempt.succeed({
          finishedAt: this.clock.now(),
          fetched: fetched.items.length,
          inserted: saveResult.inserted,
          skippedDuplicates,
          projected: projectionResult.projected,
        });
        await this.scanAttempts.save(attempt);
        ingestionSucceeded = true;
        const reported = await reportScanOutcome(command.scanJobId, () => this.scanExecutionReporter.reportSucceeded({
          tenantId: command.tenantId,
          workspaceId: command.workspaceId,
          scanJobId: command.scanJobId,
          completedAt: this.clock.now(),
          warnings: scanWarnings,
          collectionTelemetry: successfulScanCollectionExecutionMetadata({
            providerKey: sourceBinding.providerKey,
            sourceQuery: command.sourceQuery,
            telemetry: fetched.telemetry,
            insertedItemCount: saveResult.inserted,
            contentUpdatedItemCount: saveResult.contentUpdated,
            engagementMetricChangedItemCount:
              engagementProjectionResult.metricChanges,
            engagementObservationItemCount:
              engagementProjectionResult.observationsAppended,
            engagementRetentionPurgeDeferred:
              engagementProjectionResult.retentionPurgeDeferred ?? false,
            storageDuplicateItemCount: saveResult.skippedDuplicates,
            candidateMemorySuppressedItemCount:
              candidateScreening.suppressedExternalIds.length,
          }),
        }));
        if (!reported.ok) return err(reported.error);

        return ok({
          scanJobId: command.scanJobId,
          fetched: fetched.items.length,
          inserted: saveResult.inserted,
          skippedDuplicates,
          projected: projectionResult.projected,
          warnings: scanWarnings,
          ...(fetched.telemetry === undefined
            ? {}
            : { telemetry: fetched.telemetry }),
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
