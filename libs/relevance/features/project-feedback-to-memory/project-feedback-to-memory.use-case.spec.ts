import {
  tenantId,
  workspaceId,
} from '@social-monitor/shared-kernel';

import {
  createRelevanceMemoryProjection,
  type RelevanceMemoryProjection,
} from '../../domain';
import type {
  RelevanceMemoryProjectionRepositoryPort,
  RelevanceMemoryProjectorPort,
  RelevanceMemoryProjectionResult,
} from '../../ports';
import { ProjectFeedbackToMemoryUseCase } from './project-feedback-to-memory.use-case';

describe("ProjectFeedbackToMemoryUseCase", () => {
  it("projects due feedback learning into memory without owning projector details", async () => {
    const now = new Date('2026-06-25T12:00:00.000Z');
    const projection = createRelevanceMemoryProjection({
      id: 'memory-projection-1',
      tenantId: tenantId('tenant-memory'),
      workspaceId: workspaceId('workspace-memory'),
      feedbackId: 'feedback-1',
      userId: 'user-1',
      idempotencyKey: 'feedback-key-1',
      action: 'more_like_this',
      target: {
        feedItemId: 'feed-1',
        interestId: 'topic-ai',
        providerKey: 'reddit',
        title: 'Useful AI monitoring source',
      },
      learningDirection: 'positive',
      createdAt: now,
    });
    const projections = new CapturingProjectionRepository([projection]);
    const memory = new CapturingMemoryProjector({ status: 'written' });
    const useCase = new ProjectFeedbackToMemoryUseCase(
      projections,
      memory,
      { now: () => now },
    );

    const result = await useCase.execute({ limit: 10 });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value : undefined).toEqual({
      evaluated: 1,
      projected: 1,
      skipped: 0,
      failed: 0,
    });
    expect(memory.recorded).toEqual([projection]);
    expect(projections.saved[0]?.toSnapshot().status).toBe('projected');
  });
});

class CapturingProjectionRepository
  implements RelevanceMemoryProjectionRepositoryPort
{
  readonly saved: RelevanceMemoryProjection[] = [];

  constructor(private readonly due: readonly RelevanceMemoryProjection[]) {}

  async save(projection: RelevanceMemoryProjection): Promise<void> {
    this.saved.push(projection);
  }

  async findDue(): Promise<readonly RelevanceMemoryProjection[]> {
    return this.due;
  }
}

class CapturingMemoryProjector implements RelevanceMemoryProjectorPort {
  readonly recorded: RelevanceMemoryProjection[] = [];

  constructor(private readonly result: RelevanceMemoryProjectionResult) {}

  async recordRelevanceFeedback(
    projection: RelevanceMemoryProjection,
  ): Promise<RelevanceMemoryProjectionResult> {
    this.recorded.push(projection);
    return this.result;
  }
}
