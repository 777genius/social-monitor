import {
  type Clock,
  DomainError,
  type IdGenerator,
  err,
  ok,
  type Result,
} from '@social-monitor/shared-kernel';

import { SourceItem } from '../../domain';
import type { FeedProjectionPort, SourceFetcherPort, SourceItemRepositoryPort } from '../../ports';
import type { ExecuteScanCommand } from './execute-scan.command';
import type { ExecuteScanResult } from './execute-scan.result';

type ExecuteScanFailure = DomainError | Error;

export class ExecuteScanUseCase {
  constructor(
    private readonly sourceFetcher: SourceFetcherPort,
    private readonly sourceItems: SourceItemRepositoryPort,
    private readonly feedProjection: FeedProjectionPort,
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

    return ok({
      scanJobId: command.scanJobId,
      fetched: fetched.length,
      inserted: saveResult.inserted,
      skippedDuplicates: saveResult.skippedDuplicates,
      projected: projectionResult.projected,
    });
  }
}
