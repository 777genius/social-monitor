import type {
  RelevanceMemoryProjection,
  RelevanceMemoryProjectionProps,
} from '../domain';

export const RELEVANCE_MEMORY_PROJECTOR = Symbol('RELEVANCE_MEMORY_PROJECTOR');

export type RelevanceMemoryProjectionResult = {
  readonly status: 'disabled' | 'written' | 'skipped' | 'unavailable';
  readonly diagnostics?: Readonly<Record<string, unknown>>;
};

export interface RelevanceMemoryProjectorPort {
  recordRelevanceFeedback(projection: RelevanceMemoryProjection): Promise<RelevanceMemoryProjectionResult>;
}

export const NOOP_RELEVANCE_MEMORY_PROJECTOR: RelevanceMemoryProjectorPort = {
  async recordRelevanceFeedback(projection) {
    const snapshot: RelevanceMemoryProjectionProps = projection.toSnapshot();

    return {
      status: 'disabled',
      diagnostics: {
        mode: 'disabled',
        feedbackId: snapshot.feedbackId,
      },
    };
  },
};
