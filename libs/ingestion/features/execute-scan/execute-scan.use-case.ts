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
  noopSourceItemMetadataProjection,
  noopSourceItemEnrichment,
  SourceFetchError,
  type FeedProjectionPort,
  type ScanAttemptRepositoryPort,
  type ScanCursorRepositoryPort,
  type ScanExecutionReporterPort,
  type ScanFailureQueuePort,
  type ScanLeasePort,
  type SourceFetcherPort,
  type SourceItemEnrichmentPort,
  type SourceItemMetadataProjectionPort,
  type SourceItemRepositoryPort,
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
        topicId: command.topicId,
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
      const items = enriched.items.map((item) =>
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
      const projectionResult = await this.feedProjection.project({
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        topicId: sourceBinding.topicId,
        sourceBindingId: sourceBinding.sourceBindingId,
        providerKey: sourceBinding.providerKey,
        sourceItems: items,
      });
      await this.sourceItemMetadataProjection.project({
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        topicId: sourceBinding.topicId,
        sourceBindingId: sourceBinding.sourceBindingId,
        scanJobId: command.scanJobId,
        providerKey: sourceBinding.providerKey,
        sourceItems: items,
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
      });

      return ok({
        scanJobId: command.scanJobId,
        fetched: fetched.items.length,
        inserted: saveResult.inserted,
        skippedDuplicates: saveResult.skippedDuplicates,
        projected: projectionResult.projected,
      });
    } catch (error) {
      const safeFailureReason = formatScanFailureReason(error);
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
      });
      const failedCommand = {
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        scanJobId: command.scanJobId,
        topicId: sourceBinding.topicId,
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
        isRetryableScanFailure(error) &&
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
