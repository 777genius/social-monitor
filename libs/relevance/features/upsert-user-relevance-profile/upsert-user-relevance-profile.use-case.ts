import {
  type Clock,
  DomainError,
  err,
  type IdGenerator,
  ok,
  type Result,
} from '@social-monitor/shared-kernel';

import { createDefaultUserRelevanceProfile } from '../../domain';
import type { UserRelevanceProfileRepositoryPort } from '../../ports';
import { presentUserRelevanceProfile } from '../shared/relevance-presenter';
import type { UpsertUserRelevanceProfileCommand } from './upsert-user-relevance-profile.command';
import type { UpsertUserRelevanceProfileResult } from './upsert-user-relevance-profile.result';

type UpsertUserRelevanceProfileFailure = DomainError | Error;

export class UpsertUserRelevanceProfileUseCase {
  constructor(
    private readonly profiles: UserRelevanceProfileRepositoryPort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(
    command: UpsertUserRelevanceProfileCommand,
  ): Promise<Result<UpsertUserRelevanceProfileResult, UpsertUserRelevanceProfileFailure>> {
    const userId = command.userId.trim();

    if (userId.length === 0) {
      return err(new DomainError('validation.failed', 'User relevance profile userId must be non-empty'));
    }

    try {
      const existing = await this.profiles.findByUser({
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        userId,
      });
      const now = this.clock.now();
      const profile = (existing ?? createDefaultUserRelevanceProfile({
        id: this.ids.generate(),
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        userId,
        createdAt: now,
      })).update({
        topicWeights: command.topicWeights,
        sourceWeights: command.sourceWeights,
        keywordWeights: command.keywordWeights,
        mutedKeywords: command.mutedKeywords,
        blockedProviderKeys: command.blockedProviderKeys,
        updatedAt: now,
      });

      await this.profiles.save(profile);

      return ok({
        profile: presentUserRelevanceProfile(profile),
        created: existing === null,
      });
    } catch (error) {
      return err(error instanceof Error ? new DomainError('validation.failed', error.message) : new Error('Profile update failed'));
    }
  }
}
