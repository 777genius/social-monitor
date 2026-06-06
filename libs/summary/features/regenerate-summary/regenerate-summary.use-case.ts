import {
  type Clock,
  DomainError,
  type IdGenerator,
  err,
  ok,
  type Result,
} from '@social-monitor/shared-kernel';

import { SummaryJob } from '../../domain';
import type { SummaryArtifactRepositoryPort, SummaryJobRepositoryPort } from '../../ports';
import type { RegenerateSummaryCommand } from './regenerate-summary.command';
import type { RegenerateSummaryResult } from './regenerate-summary.result';

type RegenerateSummaryFailure = DomainError | Error;

export class RegenerateSummaryUseCase {
  constructor(
    private readonly summaries: SummaryArtifactRepositoryPort,
    private readonly summaryJobs: SummaryJobRepositoryPort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(command: RegenerateSummaryCommand): Promise<Result<RegenerateSummaryResult, RegenerateSummaryFailure>> {
    if (command.summaryId.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Summary id must be non-empty'));
    }

    if (command.idempotencyKey.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Idempotency key must be non-empty'));
    }

    const summary = await this.summaries.findById({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      summaryId: command.summaryId,
    });

    if (summary === null) {
      return err(new DomainError('resource.not_found', 'Summary not found', { summaryId: command.summaryId }));
    }

    const idempotencyKey = `regenerate:${command.summaryId}:${command.idempotencyKey}`;
    const existing = await this.summaryJobs.findByIdempotencyKey({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      idempotencyKey,
    });

    if (existing !== null) {
      const existingSnapshot = existing.toSnapshot();

      return ok({
        summaryJobId: existingSnapshot.id,
        status: existingSnapshot.status,
        created: false,
      });
    }

    const summarySnapshot = summary.toSnapshot();
    const job = SummaryJob.request({
      id: this.ids.generate(),
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      topicId: summarySnapshot.topicId,
      idempotencyKey,
      requestedAt: this.clock.now(),
    });
    await this.summaryJobs.save(job);
    const jobSnapshot = job.toSnapshot();

    return ok({
      summaryJobId: jobSnapshot.id,
      status: jobSnapshot.status,
      created: true,
    });
  }
}
