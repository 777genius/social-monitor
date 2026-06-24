import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { createRelevanceMemoryProjection } from '../../domain';
import {
  MemoStackRelevanceMemoryProjector,
  type MemoStackRelevanceRecordFeedbackRequest,
} from './memo-stack-relevance-memory.projector';

describe('MemoStackRelevanceMemoryProjector', () => {
  it('records relevance feedback as a user-scoped durable preference fact', async () => {
    const client = new FakeMemoStackClient();
    const projector = new MemoStackRelevanceMemoryProjector({
      baseUrl: 'https://memory.example.test',
      token: 'test-token',
      client,
    });

    const result = await projector.recordRelevanceFeedback(createRelevanceMemoryProjection({
      id: 'projection-1',
      tenantId: tenantId('tenant-relevance-memory'),
      workspaceId: workspaceId('workspace-relevance-memory'),
      feedbackId: 'feedback-relevance-memory-1',
      userId: 'user-relevance-memory',
      idempotencyKey: 'feedback-relevance-memory-key',
      action: 'hide_source',
      target: {
        feedItemId: 'feed-memory-1',
        topicId: 'topic-ai-tooling',
        providerKey: 'reddit',
        title: 'Noisy duplicate discussion',
      },
      learningDirection: 'block_provider',
      createdAt: new Date('2026-06-22T10:00:00.000Z'),
    }));

    const request = client.requests[0];
    expect(result.status).toBe('written');
    expect(request?.spaceSlug).toBe('social-monitor:tenant-relevance-memory:workspace-relevance-memory');
    expect(request?.memoryScopeExternalRef).toBe('user:user-relevance-memory:preferences');
    expect(request?.factMemoryScopeExternalRef).toBe('user:user-relevance-memory:preferences');
    expect(request?.factKind).toBe('user_preference');
    expect(request?.factCategory).toBe('user_preferences');
    expect(request?.factTtlPolicy).toBe('durable');
    expect(request?.idempotencyKey).toContain('feedback-relevance-memory-1');
    expect((request?.metadata as Record<string, unknown> | undefined)?.learning_direction).toBe('block_provider');
  });
});

class FakeMemoStackClient {
  readonly requests: MemoStackRelevanceRecordFeedbackRequest[] = [];

  readonly workflows = {
    recordFeedback: async (request: MemoStackRelevanceRecordFeedbackRequest) => {
      this.requests.push(request);

      return {
        capture: { data: { id: 'capture-1' } },
        fact: { data: { id: 'fact-1' } },
      };
    },
  };
}
