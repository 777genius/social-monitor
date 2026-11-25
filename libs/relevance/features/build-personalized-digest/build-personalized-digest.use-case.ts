import {
  DomainError,
  err,
  ok,
  type Result,
} from '@social-monitor/shared-kernel';

import type { RankFeedItemsUseCase } from '../rank-feed-items/rank-feed-items.use-case';
import type { BuildPersonalizedDigestCommand } from './build-personalized-digest.command';
import type { BuildPersonalizedDigestResult } from './build-personalized-digest.result';

type BuildPersonalizedDigestFailure = DomainError | Error;

const maxDigestLimit = 25;

export class BuildPersonalizedDigestUseCase {
  constructor(private readonly rankFeedItems: RankFeedItemsUseCase) {}

  async execute(
    command: BuildPersonalizedDigestCommand,
  ): Promise<Result<BuildPersonalizedDigestResult, BuildPersonalizedDigestFailure>> {
    const userId = command.userId.trim();
    const interestIds = [...new Set(command.interestIds.map((interestId) => interestId.trim()).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right));

    if (userId.length === 0) {
      return err(new DomainError('validation.failed', 'Personalized digest userId must be non-empty'));
    }

    if (interestIds.length === 0) {
      return err(new DomainError('validation.failed', 'Personalized digest requires at least one topic'));
    }

    if (command.windowEndedAt.getTime() <= command.windowStartedAt.getTime()) {
      return err(new DomainError('validation.failed', 'Personalized digest window end must be after start'));
    }

    if (!Number.isInteger(command.limit) || command.limit < 1 || command.limit > maxDigestLimit) {
      return err(new DomainError('validation.failed', 'Personalized digest limit must be between 1 and 25'));
    }

    const ranked = await this.rankFeedItems.execute({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      userId,
      observedAfter: command.windowStartedAt,
      limit: 50,
    });

    if (!ranked.ok) {
      return err(ranked.error);
    }

    const topicSet = new Set(interestIds);
    const items = ranked.value.items
      .filter((item) => topicSet.has(item.interestId))
      .filter((item) => new Date(item.observedAt).getTime() < command.windowEndedAt.getTime())
      .slice(0, command.limit);

    return ok({
      userId,
      status: items.length === 0 ? 'empty' : 'assembled',
      window: {
        startedAt: command.windowStartedAt.toISOString(),
        endedAt: command.windowEndedAt.toISOString(),
      },
      interestIds,
      memoryGuidance: ranked.value.memoryGuidance,
      items,
      highSignalFeedItemIds: items
        .filter((item) => item.score >= 2)
        .map((item) => item.feedItemId),
    });
  }
}
