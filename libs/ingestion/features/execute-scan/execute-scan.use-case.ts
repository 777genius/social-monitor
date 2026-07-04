import {
  type Clock,
  DomainError,
  type IdGenerator,
  type JsonObject,
  emptyJsonObjectAsUndefined,
  isSensitiveKey,
  normalizeJsonObject,
  redactSensitiveRecord,
  redactSensitiveText,
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
  SourceFetchError,
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
  type SourceItemEnrichmentPort,
  type SourceItemMetadataProjectionPort,
  type SourceItemRepositoryPort,
  type FetchedConversationUnit,
  type FetchedSourceItem,
} from "../../ports";
import type { ExecuteScanCommand } from "./execute-scan.command";
import type { ExecuteScanResult } from "./execute-scan.result";

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
      const scanWarnings = sanitizeSourceWarnings(fetched.warnings);

      const ingestedAt = this.clock.now();
      const enriched = await this.sourceItemEnrichment.enrich({
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        sourceBindingId: sourceBinding.sourceBindingId,
        scanJobId: command.scanJobId,
        providerKey: sourceBinding.providerKey,
        correlationId: command.correlationId,
        items: fetched.items,
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

      const saveResult = await this.sourceItems.saveBatch({
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        providerKey: sourceBinding.providerKey,
        items,
      });
      const persistedItems = rehydratePersistedSourceItems(
        items,
        saveResult.items,
      );
      const projectionResult = await this.feedProjection.project({
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        interestId: sourceBinding.interestId,
        sourceBindingId: sourceBinding.sourceBindingId,
        providerKey: sourceBinding.providerKey,
        sourceItems: persistedItems,
      });
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
        sourceItems: persistedItems,
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
      attempt = attempt.succeed({
        finishedAt: this.clock.now(),
        fetched: fetched.items.length,
        inserted: saveResult.inserted,
        skippedDuplicates: saveResult.skippedDuplicates,
        projected: projectionResult.projected,
      });
      await this.scanAttempts.save(attempt);
      await this.scanExecutionReporter.reportSucceeded({
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        scanJobId: command.scanJobId,
        completedAt: this.clock.now(),
        warnings: scanWarnings,
      });

      return ok({
        scanJobId: command.scanJobId,
        fetched: fetched.items.length,
        inserted: saveResult.inserted,
        skippedDuplicates: saveResult.skippedDuplicates,
        projected: projectionResult.projected,
        warnings: scanWarnings,
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

const isRetryableScanFailure = (error: unknown): boolean =>
  error instanceof SourceFetchError ? error.retryable : true;

const shouldEnqueueScanRetry = (error: unknown): boolean =>
  isRetryableScanFailure(error) && !isProviderRateLimitFailure(error);

const isProviderRateLimitFailure = (error: unknown): boolean =>
  error instanceof SourceFetchError && error.kind === "rate_limited";

const buildScanFailureMetadata = (error: unknown): JsonObject | undefined => {
  if (!(error instanceof SourceFetchError)) {
    return undefined;
  }

  return emptyJsonObjectAsUndefined(normalizeJsonObject({
    providerKey: error.providerKey,
    kind: error.kind,
    retryable: error.retryable,
    ...(error.retryAfterMs === undefined
      ? {}
      : { retryAfterMs: error.retryAfterMs }),
    ...(error.rateLimitResetAt === undefined
      ? {}
      : { rateLimitResetAt: error.rateLimitResetAt.toISOString() }),
  }));
};

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

const formatScanFailureReason = (error: unknown): string => {
  if (error instanceof SourceFetchError) {
    return [
      `provider=${error.providerKey}`,
      `kind=${error.kind}`,
      `retryable=${String(error.retryable)}`,
      `message=${error.message}`,
    ].join(" ");
  }

  return error instanceof Error
    ? error.message
    : "Unknown scan execution failure";
};

const sanitizeFetchedSourceItem = (item: FetchedSourceItem): FetchedSourceItem => ({
  ...item,
  externalId: redactSensitiveText(item.externalId),
  canonicalUrl: sanitizeFetchedSourceUrl(item.canonicalUrl),
  title: redactSensitiveText(item.title),
  body: redactSensitiveText(item.body),
  authorHandle: item.authorHandle === undefined
    ? undefined
    : redactSensitiveText(item.authorHandle),
  metadata: item.metadata === undefined
    ? undefined
    : redactSensitiveRecord(item.metadata) as JsonObject,
});

const sanitizeFetchedSourceUrl = (value: string): string => {
  const redacted = redactSensitiveText(value);

  try {
    const parsed = new URL(redacted);
    parsed.username = "";
    parsed.password = "";
    parsed.hash = "";

    for (const key of [...parsed.searchParams.keys()]) {
      if (isSensitiveKey(key)) {
        parsed.searchParams.delete(key);
      }
    }

    return parsed.toString();
  } catch {
    return redacted;
  }
};

const sanitizeFetchedConversationUnit = (
  unit: FetchedConversationUnit,
): FetchedConversationUnit => ({
  ...unit,
  rootExternalId: redactSensitiveText(unit.rootExternalId),
  rootProviderItemId: redactSensitiveText(unit.rootProviderItemId),
  providerUnitId: redactSensitiveText(unit.providerUnitId),
  canonicalUrl: sanitizeFetchedSourceUrl(unit.canonicalUrl),
  body: redactSensitiveText(unit.body),
  authorHandle: unit.authorHandle === undefined
    ? undefined
    : redactSensitiveText(unit.authorHandle),
  threadExternalId: redactSensitiveText(unit.threadExternalId),
  parentProviderUnitId: unit.parentProviderUnitId === undefined
    ? undefined
    : redactSensitiveText(unit.parentProviderUnitId),
  metadata: unit.metadata === undefined
    ? undefined
    : redactSensitiveRecord(unit.metadata) as JsonObject,
});

const sanitizeSourceWarnings = (
  warnings: readonly string[] | undefined,
): readonly string[] => [
  ...new Set(
    (warnings ?? [])
      .map((warning) => redactSensitiveText(warning).trim())
      .filter((warning) => warning.length > 0),
  ),
];
