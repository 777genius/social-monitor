import type {
  RelevanceFeedbackLearningStorePort,
  RelevanceFeedbackLearningUnitOfWorkPort,
} from '../../ports';
import type {
  RelevanceFeedbackSignal,
  RelevanceMemoryProjection,
  UserRelevanceProfile,
} from '../../domain';
import type { InMemoryRelevanceFeedbackRepository } from './in-memory-relevance-feedback.repository';
import type { InMemoryRelevanceMemoryProjectionRepository } from './in-memory-relevance-memory-projection.repository';
import type { InMemoryUserRelevanceProfileRepository } from './in-memory-user-relevance-profile.repository';

export class InMemoryRelevanceFeedbackLearningStore implements RelevanceFeedbackLearningStorePort {
  constructor(
    private readonly profiles: InMemoryUserRelevanceProfileRepository,
    private readonly feedback: InMemoryRelevanceFeedbackRepository,
    private readonly projections: InMemoryRelevanceMemoryProjectionRepository,
  ) {}

  async runLearningTransaction<TValue>(
    operation: (unitOfWork: RelevanceFeedbackLearningUnitOfWorkPort) => Promise<TValue>,
  ): Promise<TValue> {
    const profiles = new Map(this.profiles.all().map((profile) => [profileKey(profile), profile]));
    const feedbackByIdempotencyKey = new Map(this.feedback.all().map((feedback) => [feedbackKey(feedback), feedback]));
    const projections = new Map(this.projections.all().map((projection) => [projectionKey(projection), projection]));
    const profileChanges = new Map<string, UserRelevanceProfile>();
    const feedbackChanges = new Map<string, RelevanceFeedbackSignal>();
    const projectionChanges = new Map<string, RelevanceMemoryProjection>();

    const result = await operation({
      saveFeedback: async (feedback) => {
        const key = feedbackKey(feedback);
        feedbackByIdempotencyKey.set(key, feedback);
        feedbackChanges.set(key, feedback);
      },
      saveMemoryProjection: async (projection) => {
        const key = projectionKey(projection);
        if (!projections.has(key)) {
          projections.set(key, projection);
          projectionChanges.set(key, projection);
        }
      },
      saveProfile: async (profile) => {
        const key = profileKey(profile);
        profiles.set(key, profile);
        profileChanges.set(key, profile);
      },
      findFeedbackByIdempotencyKey: async (params) =>
        feedbackByIdempotencyKey.get([
          params.tenantId,
          params.workspaceId,
          params.idempotencyKey.trim(),
        ].join(':')) ?? null,
      findProfileByUser: async (params) =>
        profiles.get([
          params.tenantId,
          params.workspaceId,
          params.userId.trim(),
        ].join(':')) ?? null,
    });

    for (const feedback of feedbackChanges.values()) {
      await this.feedback.save(feedback);
    }

    for (const profile of profileChanges.values()) {
      await this.profiles.save(profile);
    }

    for (const projection of projectionChanges.values()) {
      await this.projections.save(projection);
    }

    return result;
  }
}

const profileKey = (profile: UserRelevanceProfile): string => {
  const snapshot = profile.toSnapshot();

  return [
    snapshot.tenantId,
    snapshot.workspaceId,
    snapshot.userId,
  ].join(':');
};

const feedbackKey = (feedback: RelevanceFeedbackSignal): string => {
  const snapshot = feedback.toSnapshot();

  return [
    snapshot.tenantId,
    snapshot.workspaceId,
    snapshot.idempotencyKey,
  ].join(':');
};

const projectionKey = (projection: RelevanceMemoryProjection): string => {
  const snapshot = projection.toSnapshot();

  return [
    snapshot.tenantId,
    snapshot.workspaceId,
    snapshot.feedbackId,
  ].join(':');
};
