import type { Clock, IdGenerator } from "@social-monitor/shared-kernel";
import { githubTrendingSnapshotBatchObservedAt, type SourceBinding } from "../../domain";
import type {
  ConversationProjectionPort,
  FeedProjectionPort,
  ScanCursorRepositoryPort,
  ScanLease,
  SourceCandidateMemoryPort,
  SourceEngagementProjectionPort,
  SourceFetcherPort,
  SourceItemEnrichmentPort,
  SourceItemMetadataProjectionPort,
  SourceItemRepositoryPort,
} from "../../ports";
import type { ExecuteScanCommand } from "./execute-scan.command";
import { persistScannedSourceItems } from "./persist-scanned-source-items";
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

/**
 * Collects, persists and projects one scan under an already-acquired lease.
 * Cursor advance and candidate bookkeeping must follow all required projections,
 * otherwise a recoverable failed scan could silently skip unprojected data.
 * Attempt persistence, retry and outcome reporting remain with ExecuteScanUseCase.
 */
export type ScanCollectionDependencies = {
  readonly sourceFetcher: SourceFetcherPort;
  readonly sourceItems: SourceItemRepositoryPort;
  readonly feedProjection: FeedProjectionPort;
  readonly scanCursors: ScanCursorRepositoryPort;
  readonly sourceItemMetadataProjection: SourceItemMetadataProjectionPort;
  readonly sourceItemEnrichment: SourceItemEnrichmentPort;
  readonly conversationProjection: ConversationProjectionPort;
  readonly candidateMemory: SourceCandidateMemoryPort;
  readonly sourceEngagementProjection: SourceEngagementProjectionPort;
  readonly ids: IdGenerator;
  readonly clock: Clock;
};

export async function collectAndProjectScan(
  command: ExecuteScanCommand,
  sourceBinding: SourceBinding,
  lease: ScanLease,
  deps: ScanCollectionDependencies,
) {
  const existingCursor = await deps.scanCursors.findBySourceBinding({
    tenantId: command.tenantId,
    workspaceId: command.workspaceId,
    sourceBindingId: sourceBinding.sourceBindingId,
  });
  const fetched = await deps.sourceFetcher.fetch({
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

  const ingestedAt = deps.clock.now();
  const { sanitizedFetchedItems, liveArticleFetchUrls } =
    sanitizeAndPrepareLiveArticleFetchUrls(
      sourceBinding.providerKey,
      fetched.items,
    );
  const candidateScreening = await screenSourceCandidates({
    memory: deps.candidateMemory,
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
    repository: deps.sourceItems, enrichment: deps.sourceItemEnrichment,
    items: sanitizedFetchedItems, screening: candidateScreening, capturedAt: ingestedAt,
    clock: deps.clock, ids: deps.ids, lease, correlationId: command.correlationId,
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
    : await deps.feedProjection.project({
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
    const conversationResult = await deps.conversationProjection.project({
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
    await deps.sourceItemMetadataProjection.project({
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
    await deps.sourceEngagementProjection.project({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      sourceBindingId: sourceBinding.sourceBindingId,
      scanJobId: command.scanJobId,
      providerKey: sourceBinding.providerKey,
      observedAt: projectionObservedAt,
      samples: engagementSamples,
    });
  if (fetched.nextCursor !== undefined) {
    await deps.scanCursors.save({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      sourceBindingId: sourceBinding.sourceBindingId,
      cursor: fetched.nextCursor,
      committedAt: deps.clock.now(),
    });
  }
  const candidateMemoryWriteWarning =
    await rememberProcessedSourceCandidates({
      memory: deps.candidateMemory,
      screening: candidateScreening,
      processedExternalIds: new Set(
        [
          ...enriched.items.map((item) => item.externalId),
          ...engagementSamples.map((sample) => sample.externalId),
        ],
      ),
      rememberedAt: deps.clock.now(),
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
  return {
    fetched,
    saveResult,
    projectionResult,
    engagementProjectionResult,
    candidateScreening,
    scanWarnings,
    skippedDuplicates,
  };
}
