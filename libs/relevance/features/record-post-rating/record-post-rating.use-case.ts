import {
  type Clock,
  DomainError,
  err,
  type IdGenerator,
  ok,
  type Result,
} from '@social-monitor/shared-kernel';

import { createPostRatingRecord, postRatingRequiresReason } from '../../domain';
import type { PostRatingRepositoryPort } from '../../ports';
import { presentPostRating } from '../shared/relevance-presenter';
import type { RecordPostRatingCommand } from './record-post-rating.command';
import type { RecordPostRatingResult } from './record-post-rating.result';

type RecordPostRatingFailure = DomainError | Error;

export class RecordPostRatingUseCase {
  constructor(
    private readonly ratings: PostRatingRepositoryPort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(
    command: RecordPostRatingCommand,
  ): Promise<Result<RecordPostRatingResult, RecordPostRatingFailure>> {
    const userId = command.userId.trim();
    const idempotencyKey = command.idempotencyKey.trim();

    if (userId.length === 0) {
      return err(new DomainError('validation.failed', 'Post rating userId must be non-empty'));
    }

    if (idempotencyKey.length === 0) {
      return err(new DomainError('validation.failed', 'Post rating idempotencyKey must be non-empty'));
    }

    if (postRatingRequiresReason(command.rating) && command.reason === undefined) {
      return err(new DomainError('validation.failed', 'Post rating reason is required for 1-2 star ratings'));
    }

    try {
      const cached = await this.ratings.findPostRatingByIdempotencyKey({
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        idempotencyKey,
      });

      if (cached !== null) {
        if (cached.userId !== userId) {
          return err(new DomainError('validation.failed', 'Post rating idempotencyKey belongs to a different user'));
        }

        return ok({
          rating: presentPostRating(cached),
          created: false,
          learningDirection: 'recorded',
        });
      }

      const record = createPostRatingRecord({
        feedbackId: this.ids.generate(),
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        userId,
        idempotencyKey,
        rating: command.rating,
        reason: command.reason,
        target: command.target,
        ratedAt: this.clock.now(),
      });

      await this.ratings.savePostRating(record);

      return ok({
        rating: presentPostRating(record),
        created: true,
        learningDirection: 'recorded',
      });
    } catch (error: unknown) {
      return err(toRecordPostRatingFailure(error));
    }
  }
}

const toRecordPostRatingFailure = (error: unknown): RecordPostRatingFailure => {
  if (error instanceof DomainError) {
    return error;
  }

  if (error instanceof Error) {
    return new DomainError('validation.failed', error.message);
  }

  return new Error('Post rating failed');
};
