import type { Clock } from '@social-monitor/shared-kernel';

import type {
  RelevanceMemoryProjectionRepositoryPort,
  RelevanceMemoryProjectorPort,
} from '../../ports';
import type { ProjectFeedbackToMemoryCommand } from './project-feedback-to-memory.command';
import { ProjectRelevanceMemoryBatchUseCase } from '../project-relevance-memory/project-relevance-memory-batch.use-case';

export class ProjectFeedbackToMemoryUseCase {
  private readonly batch: ProjectRelevanceMemoryBatchUseCase;

  constructor(
    projections: RelevanceMemoryProjectionRepositoryPort,
    memory: RelevanceMemoryProjectorPort,
    clock: Clock,
  ) {
    this.batch = new ProjectRelevanceMemoryBatchUseCase(
      projections,
      memory,
      clock,
    );
  }

  execute(command: ProjectFeedbackToMemoryCommand) {
    return this.batch.execute(command);
  }
}
