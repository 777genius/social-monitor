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
  createRelevanceMemoryProjection,
  extractSignalKeywords,
  relevanceFeedbackDirection,
  RelevanceFeedbackSignal,
  type RelevanceFeedbackTarget,
} from '../../domain';
import type {
  RelevanceFeedbackLearningStorePort,
  RelevanceFeedbackLearningUnitOfWorkPort,
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
    private readonly learning: RelevanceFeedbackLearningStorePort,
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

    return this.learning.runLearningTransaction(async (learning) => {
      const cached = await learning.findFeedbackByIdempotencyKey({
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        idempotencyKey,
      });

      if (cached !== null) {
        const snapshot = cached.toSnapshot();

        if (snapshot.userId !== userId) {
          return err(new DomainError('validation.failed', 'Relevance feedback idempotencyKey belongs to a different user'));
        }

        const direction = relevanceFeedbackDirection(snapshot.action, snapshot.rating);
        const profile = await this.profileForCachedFeedback({
          learning,
          tenantId: command.tenantId,
          workspaceId: command.workspaceId,
          userId,
          target: snapshot.target,
          direction,
        });
        await learning.saveMemoryProjection(createRelevanceMemoryProjection({
          id: this.ids.generate(),
          tenantId: snapshot.tenantId,
          workspaceId: snapshot.workspaceId,
          feedbackId: snapshot.id,
          userId,
          idempotencyKey: snapshot.idempotencyKey,
          action: snapshot.action,
          rating: snapshot.rating,
          target: snapshot.target,
          learningDirection: direction,
          createdAt: this.clock.now(),
        }));

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
      const profile = await this.profileForUser(learning, command, userId, now);
      const target = signal.toSnapshot().target;
      const direction = relevanceFeedbackDirection(command.action, command.rating);
      const updatedProfile = profile.applyFeedback({
        interestId: target.interestId,
        providerKey: target.providerKey,
        keywords: extractSignalKeywords(`${target.title} ${target.bodyPreview ?? ''}`),
        direction,
        adjustedAt: now,
      });

      await learning.saveFeedback(signal);
      await learning.saveProfile(updatedProfile);
      await learning.saveMemoryProjection(createRelevanceMemoryProjection({
        id: this.ids.generate(),
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        feedbackId: signal.toSnapshot().id,
        userId,
        idempotencyKey,
        action: command.action,
        rating: command.rating,
        target,
        learningDirection: direction,
        createdAt: now,
      }));

      return ok({
        feedback: presentRelevanceFeedbackSignal(signal),
        profile: presentUserRelevanceProfile(updatedProfile),
        created: true,
        learningDirection: direction,
      });
    }).catch((error: unknown) => err(toRecordRelevanceFeedbackFailure(error)));
  }

  private async profileForCachedFeedback(params: {
    readonly learning: RelevanceFeedbackLearningUnitOfWorkPort;
    readonly tenantId: RecordRelevanceFeedbackCommand['tenantId'];
    readonly workspaceId: RecordRelevanceFeedbackCommand['workspaceId'];
    readonly userId: string;
    readonly target: RelevanceFeedbackTarget;
    readonly direction: ReturnType<typeof relevanceFeedbackDirection>;
  }) {
    const now = this.clock.now();
    const profile = await this.profileForUser(
      params.learning,
      {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
      },
      params.userId,
      now,
    );
    const snapshot = profile.toSnapshot();
    const mayNeedRepair =
      snapshot.interestWeights.length === 0 &&
      snapshot.sourceWeights.length === 0 &&
      snapshot.keywordWeights.length === 0 &&
      snapshot.blockedProviderKeys.length === 0;

    if (!mayNeedRepair) {
      return profile;
    }

    const repaired = profile.applyFeedback({
      interestId: params.target.interestId,
      providerKey: params.target.providerKey,
      keywords: extractSignalKeywords(`${params.target.title} ${params.target.bodyPreview ?? ''}`),
      direction: params.direction,
      adjustedAt: now,
    });
    await params.learning.saveProfile(repaired);

    return repaired;
  }

  private async profileForUser(
    learning: RelevanceFeedbackLearningUnitOfWorkPort,
    command: Pick<RecordRelevanceFeedbackCommand, 'tenantId' | 'workspaceId'>,
    userId: string,
    now: Date,
  ) {
    const existing = await learning.findProfileByUser({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      userId,
    });

    if (existing !== null) {
      return existing;
    }

    return createDefaultUserRelevanceProfile({
      id: this.ids.generate(),
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      userId,
      createdAt: now,
    });
  }
}

const toRecordRelevanceFeedbackFailure = (error: unknown): RecordRelevanceFeedbackFailure => {
  if (error instanceof DomainError) {
    return error;
  }

  if (error instanceof Error) {
    return new DomainError('validation.failed', error.message);
  }

  return new Error('Relevance feedback failed');
};
