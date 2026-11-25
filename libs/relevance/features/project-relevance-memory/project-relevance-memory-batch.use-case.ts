import {
  type Clock,
  DomainError,
  err,
  ok,
  type Result,
} from '@social-monitor/shared-kernel';

import type {
  RelevanceMemoryProjectionRepositoryPort,
  RelevanceMemoryProjectorPort,
} from '../../ports';
import type { ProjectRelevanceMemoryBatchCommand } from './project-relevance-memory-batch.command';
import type { ProjectRelevanceMemoryBatchResult } from './project-relevance-memory-batch.result';

type ProjectRelevanceMemoryBatchFailure = DomainError | Error;

export class ProjectRelevanceMemoryBatchUseCase {
  constructor(
    private readonly projections: RelevanceMemoryProjectionRepositoryPort,
    private readonly memory: RelevanceMemoryProjectorPort,
    private readonly clock: Clock,
  ) {}

  async execute(
    command: ProjectRelevanceMemoryBatchCommand,
  ): Promise<Result<ProjectRelevanceMemoryBatchResult, ProjectRelevanceMemoryBatchFailure>> {
    if (!Number.isInteger(command.limit) || command.limit < 1 || command.limit > 100) {
      return err(new DomainError('validation.failed', 'Relevance memory projection limit must be between 1 and 100'));
    }

    if ((command.tenantId === undefined) !== (command.workspaceId === undefined)) {
      return err(new DomainError(
        'validation.failed',
        'Relevance memory projection tenantId and workspaceId must be set together',
      ));
    }

    const now = this.clock.now();
    const due = await this.projections.findDue({
      limit: command.limit,
      now,
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
    });
    let projected = 0;
    let skipped = 0;
    let failed = 0;

    for (const projection of due) {
      try {
        const result = await this.memory.recordRelevanceFeedback(projection);
        if (result.status === 'unavailable') {
          failed += 1;
          await this.projections.save(projection.markFailed(
            'Relevance memory projector is unavailable',
            this.clock.now(),
          ));
          continue;
        }

        await this.projections.save(projection.markProjected(this.clock.now()));
        if (result.status === 'skipped' || result.status === 'disabled') {
          skipped += 1;
        } else {
          projected += 1;
        }
      } catch (error) {
        failed += 1;
        await this.projections.save(projection.markFailed(
          error instanceof Error ? error.message : 'unknown memory projection error',
          this.clock.now(),
        ));
      }
    }

    return ok({
      evaluated: due.length,
      projected,
      skipped,
      failed,
    });
  }
}
