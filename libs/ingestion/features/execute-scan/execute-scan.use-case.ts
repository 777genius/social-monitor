import {
  type Clock,
  DomainError,
  type IdGenerator,
  err,
  ok,
  type Result,
} from '@social-monitor/shared-kernel';

import { ScanAttempt, SourceItem } from '../../domain';
import type {
  FeedProjectionPort,
  ScanAttemptRepositoryPort,
  SourceFetcherPort,
  SourceItemRepositoryPort,
} from '../../ports';
import type { ExecuteScanCommand } from './execute-scan.command';
import type { ExecuteScanResult } from './execute-scan.result';

type ExecuteScanFailure = DomainError | Error;

export class ExecuteScanUseCase {
  constructor(
    private readonly sourceFetcher: SourceFetcherPort,
    private readonly sourceItems: SourceItemRepositoryPort,
    private readonly feedProjection: FeedProjectionPort,
    private readonly scanAttempts: ScanAttemptRepositoryPort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(command: ExecuteScanCommand): Promise<Result<ExecuteScanResult, ExecuteScanFailure>> {
    if (command.scanJobId.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Scan job id must be non-empty'));
    }

    if (command.sourceBindingId.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Source binding id must be non-empty'));
    }

    let attempt = ScanAttempt.start({
      scanJobId: command.scanJobId,
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      sourceBindingId: command.sourceBindingId,
      startedAt: this.clock.now(),
    });
    await this.scanAttempts.save(attempt);

    try {
      const fetched = await this.sourceFetcher.fetch({
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        sourceBindingId: command.sourceBindingId,
        scanJobId: command.scanJobId,
      });

      const ingestedAt = this.clock.now();
      const items = fetched.map((item) =>
        SourceItem.ingest({
          id: this.ids.generate(),
          tenantId: command.tenantId,
          workspaceId: command.workspaceId,
          sourceBindingId: command.sourceBindingId,
          externalId: item.externalId,
          canonicalUrl: item.canonicalUrl,
          title: item.title,
          body: item.body,
          authorHandle: item.authorHandle,
          publishedAt: item.publishedAt,
          ingestedAt,
        }),
      );

      const saveResult = await this.sourceItems.saveBatch({
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        items,
      });
      const projectionResult = await this.feedProjection.project({
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        sourceBindingId: command.sourceBindingId,
        sourceItems: items,
      });
      attempt = attempt.succeed({
        finishedAt: this.clock.now(),
        fetched: fetched.length,
        inserted: saveResult.inserted,
        skippedDuplicates: saveResult.skippedDuplicates,
        projected: projectionResult.projected,
      });
      await this.scanAttempts.save(attempt);

      return ok({
        scanJobId: command.scanJobId,
        fetched: fetched.length,
        inserted: saveResult.inserted,
        skippedDuplicates: saveResult.skippedDuplicates,
        projected: projectionResult.projected,
      });
    } catch (error) {
      attempt = attempt.fail({
        finishedAt: this.clock.now(),
        failureReason: error instanceof Error ? error.message : 'Unknown scan execution failure',
      });
      await this.scanAttempts.save(attempt);

      return err(error instanceof Error ? error : new Error('Unknown scan execution failure'));
    }
  }
}
