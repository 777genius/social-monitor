import {
  type Clock,
  DomainError,
  err,
  type IdGenerator,
  ok,
  type Result,
} from '@social-monitor/shared-kernel';

import {
  createDefaultUserRelevanceProfile,
  extractSignalKeywords,
  relevanceFeedbackDirection,
  RelevanceFeedbackSignal,
} from '../../domain';
import type {
  RelevanceFeedbackRepositoryPort,
  UserRelevanceProfileRepositoryPort,
} from '../../ports';
import {
  presentRelevanceFeedbackSignal,
  presentUserRelevanceProfile,
} from '../shared/relevance-presenter';
import type { RecordRelevanceFeedbackCommand } from './record-relevance-feedback.command';
import type { RecordRelevanceFeedbackResult } from './record-relevance-feedback.result';

type RecordRelevanceFeedbackFailure = DomainError | Error;

export class RecordRelevanceFeedbackUseCase {
  constructor(
    private readonly profiles: UserRelevanceProfileRepositoryPort,
    private readonly feedback: RelevanceFeedbackRepositoryPort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(
    command: RecordRelevanceFeedbackCommand,
  ): Promise<Result<RecordRelevanceFeedbackResult, RecordRelevanceFeedbackFailure>> {
    const userId = command.userId.trim();
    const idempotencyKey = command.idempotencyKey.trim();

    if (userId.length === 0) {
      return err(new DomainError('validation.failed', 'Relevance feedback userId must be non-empty'));
    }

    if (idempotencyKey.length === 0) {
      return err(new DomainError('validation.failed', 'Relevance feedback idempotencyKey must be non-empty'));
    }

    try {
      const cached = await this.feedback.findByIdempotencyKey({
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        idempotencyKey,
      });

      if (cached !== null) {
        const profile = await this.requireProfile(command, userId);
        const direction = relevanceFeedbackDirection(cached.toSnapshot().action, cached.toSnapshot().rating);

        return ok({
          feedback: presentRelevanceFeedbackSignal(cached),
          profile: presentUserRelevanceProfile(profile),
          created: false,
          learningDirection: direction,
        });
      }

      const now = this.clock.now();
      const signal = RelevanceFeedbackSignal.record({
        id: this.ids.generate(),
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        userId,
        idempotencyKey,
        action: command.action,
        rating: command.rating,
        target: command.target,
        createdAt: now,
      });
      const profile = await this.requireProfile(command, userId);
      const target = signal.toSnapshot().target;
      const direction = relevanceFeedbackDirection(command.action, command.rating);
      const updatedProfile = profile.applyFeedback({
        topicId: target.topicId,
        providerKey: target.providerKey,
        keywords: extractSignalKeywords(`${target.title} ${target.bodyPreview ?? ''}`),
        direction,
        adjustedAt: now,
      });

      await this.feedback.save(signal);
      await this.profiles.save(updatedProfile);

      return ok({
        feedback: presentRelevanceFeedbackSignal(signal),
        profile: presentUserRelevanceProfile(updatedProfile),
        created: true,
        learningDirection: direction,
      });
    } catch (error) {
      return err(error instanceof Error ? new DomainError('validation.failed', error.message) : new Error('Relevance feedback failed'));
    }
  }

  private async requireProfile(
    command: Pick<RecordRelevanceFeedbackCommand, 'tenantId' | 'workspaceId'>,
    userId: string,
  ) {
    const existing = await this.profiles.findByUser({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      userId,
    });

    if (existing !== null) {
      return existing;
    }

    const now = this.clock.now();
    const profile = createDefaultUserRelevanceProfile({
      id: this.ids.generate(),
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      userId,
      createdAt: now,
    });
    await this.profiles.save(profile);

    return profile;
  }
}
