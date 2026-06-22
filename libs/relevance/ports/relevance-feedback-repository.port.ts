import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { RelevanceFeedbackSignal } from '../domain';

export const RELEVANCE_FEEDBACK_REPOSITORY = Symbol('RELEVANCE_FEEDBACK_REPOSITORY');

export interface RelevanceFeedbackRepositoryPort {
  save(feedback: RelevanceFeedbackSignal): Promise<void>;
  findByIdempotencyKey(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly idempotencyKey: string;
  }): Promise<RelevanceFeedbackSignal | null>;
}
