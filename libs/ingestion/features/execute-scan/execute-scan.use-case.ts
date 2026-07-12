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
  SourceItem,
} from "../../domain";
import {
  noopConversationProjection,
  noopSourceItemMetadataProjection,
  noopSourceItemEnrichment,
  noopSourceEngagementProjection,
  NOOP_SOURCE_CANDIDATE_MEMORY,
  SourceItemPersistenceContractError,
  type ConversationProjectionPort,
  type FeedProjectionPort,
  type ScanAttemptRepositoryPort,
  type ScanCursorRepositoryPort,
  type ScanExecutionReporterPort,
  type ScanFailureQueuePort,
  type ScanLeasePort,
  type SavedSourceItemRef,
  type SourceFetcherPort,
  type SourceCandidateMemoryPort,
  type SourceItemEnrichmentPort,
  type SourceItemMetadataProjectionPort,
  type SourceItemRepositoryPort,
  type SourceEngagementProjectionPort,
} from "../../ports";
import type { ExecuteScanCommand } from "./execute-scan.command";
import type { ExecuteScanResult } from "./execute-scan.result";
import {
  failedScanCollectionExecutionMetadata,
  successfulScanCollectionExecutionMetadata,
} from "./scan-collection-execution-metadata";
import {
  buildScanFailureMetadata,
  formatScanFailureReason,
  isProviderRateLimitFailure,
  providerFailureKind,
  shouldEnqueueScanRetry,
} from "./scan-execution-failure";
import {
  sanitizeFetchedConversationUnit,
  sanitizeFetchedSourceItem,
  sanitizeSourceWarnings,
} from "./scan-source-sanitization";
import {
  rememberProcessedSourceCandidates,
  screenSourceCandidates,
} from "./source-candidate-memory-coordinator";
import { prepareSourceEngagementSamples } from "./source-engagement-sample-coordinator";

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
        }),
      );
    }

    let attempt = ScanAttempt.start({
      scanJobId: command.scanJobId,
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      sourceBindingId: sourceBinding.sourceBindingId,
      startedAt: this.clock.now(),
    });
    await this.scanAttempts.save(attempt);

    try {
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
      const sanitizedFetchedItems = fetched.items.map(
        sanitizeFetchedSourceItem,
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
      const enriched = candidateScreening.itemsToEnrich.length === 0
        ? { items: [], enriched: 0, skipped: 0, failed: 0 }
        : await this.sourceItemEnrichment.enrich({
            tenantId: command.tenantId,
            workspaceId: command.workspaceId,
            sourceBindingId: sourceBinding.sourceBindingId,
            scanJobId: command.scanJobId,
            providerKey: sourceBinding.providerKey,
            correlationId: command.correlationId,
            items: candidateScreening.itemsToEnrich,
          });
      const items = enriched.items.map(sanitizeFetchedSourceItem).map((item) =>
        SourceItem.ingest({
          id: this.ids.generate(),
          tenantId: command.tenantId,
          workspaceId: command.workspaceId,
          sourceBindingId: sourceBinding.sourceBindingId,
          externalId: item.externalId,
          canonicalUrl: item.canonicalUrl,
          title: item.title,
          body: item.body,
          authorHandle: item.authorHandle,
          publishedAt: item.publishedAt,
          ingestedAt,
          metadata: item.metadata,
        }),
      );

      const saveResult = items.length === 0
        ? {
            inserted: 0,
            contentUpdated: 0,
            skippedDuplicates: 0,
            items: [],
          }
        : await this.sourceItems.saveBatch({
            tenantId: command.tenantId,
            workspaceId: command.workspaceId,
            providerKey: sourceBinding.providerKey,
            items,
          });
      const persistedItems = rehydratePersistedSourceItems(
        items,
        saveResult.items,
      );
      const { sourceItemsForFullProjection, engagementSamples } =
        prepareSourceEngagementSamples({
          providerKey: sourceBinding.providerKey,
          persistedItems,
          savedItems: saveResult.items,
          candidateScreening,
        });
      const engagementProjectionResult = engagementSamples.length === 0
        ? {
            currentSnapshotsUpdated: 0,
            observationsAppended: 0,
            metricChanges: 0,
            regressionsObserved: 0,
          }
        : await this.sourceEngagementProjection.project({
            tenantId: command.tenantId,
            workspaceId: command.workspaceId,
            sourceBindingId: sourceBinding.sourceBindingId,
            scanJobId: command.scanJobId,
            providerKey: sourceBinding.providerKey,
            observedAt: ingestedAt,
            samples: engagementSamples,
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
            query: command.interestQuerySnapshot ?? command.sourceQuery.query,
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
      if (sourceItemsForFullProjection.length > 0) {
        await this.conversationProjection.project({
          tenantId: command.tenantId,
          workspaceId: command.workspaceId,
          interestId: sourceBinding.interestId,
          sourceBindingId: sourceBinding.sourceBindingId,
          providerKey: sourceBinding.providerKey,
          observedAt: ingestedAt,
          conversationUnits: (fetched.conversationUnits ?? []).map(
            sanitizeFetchedConversationUnit,
          ),
          projectedFeedItems: projectionResult.projectedItems,
        });
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
              ...items.map((item) => item.toSnapshot().externalId),
              ...engagementSamples.map((sample) => sample.externalId),
            ],
          ),
          rememberedAt: this.clock.now(),
        });
      if (candidateMemoryWriteWarning !== undefined) {
        scanWarnings.push(candidateMemoryWriteWarning);
      }
      const skippedDuplicates =
        saveResult.skippedDuplicates +
        candidateScreening.suppressedExternalIds.length;
      attempt = attempt.succeed({
        finishedAt: this.clock.now(),
        fetched: fetched.items.length,
        inserted: saveResult.inserted,
        skippedDuplicates,
        projected: projectionResult.projected,
      });
      await this.scanAttempts.save(attempt);
      await this.scanExecutionReporter.reportSucceeded({
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
      });

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
      const safeFailureReason = formatScanFailureReason(error);
      const failureMetadata = buildScanFailureMetadata(error);
      attempt = attempt.fail({
        finishedAt: this.clock.now(),
        failureReason: safeFailureReason,
      });
      await this.scanAttempts.save(attempt);
      await this.scanExecutionReporter.reportFailed({
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
      });
      const failedCommand = {
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        scanJobId: command.scanJobId,
        interestId: sourceBinding.interestId,
        sourceBindingId: sourceBinding.sourceBindingId,
        scanPolicyId: scanPolicy.scanPolicyId,
        providerKey: sourceBinding.providerKey,
        sourceQuery: command.sourceQuery,
        correlationId: command.correlationId,
        causationId: command.causationId,
        attemptNumber: scanPolicy.attemptNumber,
        retryBudget: scanPolicy.retryBudget,
        failureReason: safeFailureReason,
      };

      if (
        shouldEnqueueScanRetry(error) &&
        scanPolicy.attemptNumber < scanPolicy.retryBudget
      ) {
        await this.scanFailures.enqueueRetry({
          ...failedCommand,
          nextAttemptNumber: scanPolicy.attemptNumber + 1,
        });
      } else {
        await this.scanFailures.deadLetter(failedCommand);
      }

      return err(
        error instanceof Error
          ? error
          : new Error("Unknown scan execution failure"),
      );
    } finally {
      await this.scanLeases.release(lease);
    }
  }
}

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

const rehydratePersistedSourceItems = (
  items: readonly SourceItem[],
  refs: readonly SavedSourceItemRef[],
): readonly SourceItem[] => {
  if (items.length !== refs.length) {
    throw new SourceItemPersistenceContractError(
      `Source item repository returned ${refs.length} saved refs for ${items.length} source items`,
    );
  }

  const persistedIdByExternalId = new Map<string, string>();
  for (const ref of refs) {
    const existingId = persistedIdByExternalId.get(ref.externalId);
    if (existingId !== undefined && existingId !== ref.sourceItemId) {
      throw new SourceItemPersistenceContractError(
        `Source item repository returned conflicting ids for external item ${ref.externalId}`,
      );
    }

    persistedIdByExternalId.set(ref.externalId, ref.sourceItemId);
  }

  return items.map((item) => {
    const snapshot = item.toSnapshot();
    const sourceItemId = persistedIdByExternalId.get(snapshot.externalId);

    if (sourceItemId === undefined) {
      throw new SourceItemPersistenceContractError(
        `Source item repository did not return a saved ref for external item ${snapshot.externalId}`,
      );
    }

    if (sourceItemId === snapshot.id) {
      return item;
    }

    return SourceItem.rehydrate({
      ...snapshot,
      id: sourceItemId,
    });
  });
};
