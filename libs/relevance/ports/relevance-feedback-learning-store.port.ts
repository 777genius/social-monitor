import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type {
  RelevanceFeedbackSignal,
  RelevanceMemoryProjection,
  UserRelevanceProfile,
} from '../domain';

export const RELEVANCE_FEEDBACK_LEARNING_STORE = Symbol('RELEVANCE_FEEDBACK_LEARNING_STORE');

export interface RelevanceFeedbackLearningStorePort {
  runLearningTransaction<TValue>(
    operation: (unitOfWork: RelevanceFeedbackLearningUnitOfWorkPort) => Promise<TValue>,
  ): Promise<TValue>;
}

export interface RelevanceFeedbackLearningUnitOfWorkPort {
  saveFeedback(feedback: RelevanceFeedbackSignal): Promise<void>;
  saveMemoryProjection(projection: RelevanceMemoryProjection): Promise<void>;
  saveProfile(profile: UserRelevanceProfile): Promise<void>;
  findFeedbackByIdempotencyKey(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly idempotencyKey: string;
  }): Promise<RelevanceFeedbackSignal | null>;
  findProfileByUser(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly userId: string;
  }): Promise<UserRelevanceProfile | null>;
}
