import { FixedClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import {
  createRelevanceMemoryProjection,
  type RelevanceMemoryProjection,
} from '../../domain';
import type {
  RelevanceMemoryProjectionRepositoryPort,
  RelevanceMemoryProjectionResult,
  RelevanceMemoryProjectorPort,
} from '../../ports';
import { ProjectRelevanceMemoryBatchUseCase } from './project-relevance-memory-batch.use-case';

describe('ProjectRelevanceMemoryBatchUseCase', () => {
  it('projects due relevance memory records and marks them projected', async () => {
    const projections = new FakeProjectionRepository();
    const projector = new CapturingProjector({ status: 'written' });
    const clock = new FixedClock(new Date('2026-06-22T10:00:00.000Z'));
    const projection = makeProjection();
    await projections.save(projection);

    const result = await new ProjectRelevanceMemoryBatchUseCase(projections, projector, clock).execute({
      limit: 10,
    });

    expect(result.ok && result.value).toEqual({
      evaluated: 1,
      projected: 1,
      skipped: 0,
      failed: 0,
    });
    expect(projector.recorded).toHaveLength(1);
    expect(projections.all()[0]?.toSnapshot().status).toBe('projected');
  });

  it('keeps failed records retryable with backoff', async () => {
    const projections = new FakeProjectionRepository();
    const projector = new FailingProjector();
    const clock = new FixedClock(new Date('2026-06-22T10:00:00.000Z'));
    await projections.save(makeProjection());

    const result = await new ProjectRelevanceMemoryBatchUseCase(projections, projector, clock).execute({
      limit: 10,
    });
    const snapshot = projections.all()[0]?.toSnapshot();

    expect(result.ok && result.value.failed).toBe(1);
    expect(snapshot?.status).toBe('failed');
    expect(snapshot?.retryCount).toBe(1);
    expect(snapshot?.nextAttemptAt.toISOString()).toBe('2026-06-22T10:01:00.000Z');
    expect(snapshot?.lastError).toBe('memo-stack unavailable');
  });

  it('marks disabled projection as skipped so an enabled loop does not spin forever', async () => {
    const projections = new FakeProjectionRepository();
    const projector = new CapturingProjector({ status: 'disabled' });
    const clock = new FixedClock(new Date('2026-06-22T10:00:00.000Z'));
    await projections.save(makeProjection());

    const result = await new ProjectRelevanceMemoryBatchUseCase(projections, projector, clock).execute({
      limit: 10,
    });

    expect(result.ok && result.value).toEqual({
      evaluated: 1,
      projected: 0,
      skipped: 1,
      failed: 0,
    });
    expect(projections.all()[0]?.toSnapshot().status).toBe('projected');
  });
});

class FakeProjectionRepository implements RelevanceMemoryProjectionRepositoryPort {
  private readonly projections = new Map<string, RelevanceMemoryProjection>();

  async save(projection: RelevanceMemoryProjection): Promise<void> {
    this.projections.set(projection.toSnapshot().id, projection);
  }

  async findDue(
    params: Parameters<RelevanceMemoryProjectionRepositoryPort['findDue']>[0],
  ): Promise<readonly RelevanceMemoryProjection[]> {
    return [...this.projections.values()]
      .filter((projection) => {
        const snapshot = projection.toSnapshot();

        return (snapshot.status === 'pending' || snapshot.status === 'failed') &&
          snapshot.nextAttemptAt.getTime() <= params.now.getTime();
      })
      .slice(0, params.limit);
  }

  all(): readonly RelevanceMemoryProjection[] {
    return [...this.projections.values()];
  }
}

class CapturingProjector implements RelevanceMemoryProjectorPort {
  readonly recorded: RelevanceMemoryProjection[] = [];

  constructor(private readonly result: RelevanceMemoryProjectionResult) {}

  async recordRelevanceFeedback(projection: RelevanceMemoryProjection): Promise<RelevanceMemoryProjectionResult> {
    this.recorded.push(projection);

    return this.result;
  }
}

class FailingProjector implements RelevanceMemoryProjectorPort {
  async recordRelevanceFeedback(): Promise<RelevanceMemoryProjectionResult> {
    throw new Error('memo-stack unavailable');
  }
}

const makeProjection = (): RelevanceMemoryProjection =>
  createRelevanceMemoryProjection({
    id: 'projection-1',
    tenantId: tenantId('tenant-memory-projection'),
    workspaceId: workspaceId('workspace-memory-projection'),
    feedbackId: 'feedback-1',
    userId: 'user-memory-projection',
    idempotencyKey: 'feedback-memory-1',
    action: 'more_like_this',
    rating: 5,
    target: {
      feedItemId: 'feed-1',
      topicId: 'topic-ai-tooling',
      providerKey: 'github',
      title: 'Trending AI developer library',
    },
    learningDirection: 'positive',
    createdAt: new Date('2026-06-22T10:00:00.000Z'),
  });
