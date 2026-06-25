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
    expect((request?.metadata as Record<string, unknown> | undefined)?.ranking_feedback_kind).toBe('low_quality_source');
    expect(request?.factTags).toEqual(expect.arrayContaining([
      'ranking-feedback',
      'ranking-feedback-low-quality-source',
    ]));
    expect(request?.text).toEqual(expect.stringContaining('Ranking quality signal: low_quality_source'));
  });

  it('marks negative reader actions as weak provider-overranked ranking memory', async () => {
    const client = new FakeMemoStackClient();
    const projector = new MemoStackRelevanceMemoryProjector({
      baseUrl: 'https://memory.example.test',
      token: 'test-token',
      client,
    });

    await projector.recordRelevanceFeedback(createRelevanceMemoryProjection({
      id: 'projection-2',
      tenantId: tenantId('tenant-relevance-memory'),
      workspaceId: workspaceId('workspace-relevance-memory'),
      feedbackId: 'feedback-relevance-memory-2',
      userId: 'user-relevance-memory',
      idempotencyKey: 'feedback-relevance-memory-key-2',
      action: 'less_like_this',
      target: {
        topicId: 'topic-ai-tooling',
        providerKey: 'reddit',
        title: 'Noisy single-source post',
        bodyPreview: 'This looks less useful than the other sources.',
      },
      learningDirection: 'negative',
      createdAt: new Date('2026-06-22T10:05:00.000Z'),
    }));

    const request = client.requests[0];
    expect((request?.metadata as Record<string, unknown> | undefined)?.ranking_feedback_kind).toBe('provider_overranked');
    expect((request?.metadata as Record<string, unknown> | undefined)?.ranking_feedback_strength).toBe('explicit_reader_action');
    expect(request?.factTags).toEqual(expect.arrayContaining([
      'ranking-feedback',
      'ranking-feedback-provider-overranked',
    ]));
    expect(request?.text).toEqual(expect.stringContaining('weak provider-overranked signal'));
  });

  it.each([
    ['false merge: not the same story', 'possible_false_merge', 'ranking-feedback-false-merge'],
    ['duplicate missed: same story duplicated in the summary', 'possible_duplicate_missed', 'ranking-feedback-duplicate-missed'],
  ])('classifies explicit ranking quality phrase "%s"', async (bodyPreview, expectedKind, expectedTag) => {
    const client = new FakeMemoStackClient();
    const projector = new MemoStackRelevanceMemoryProjector({
      baseUrl: 'https://memory.example.test',
      token: 'test-token',
      client,
    });

    await projector.recordRelevanceFeedback(createRelevanceMemoryProjection({
      id: `projection-${expectedKind}`,
      tenantId: tenantId('tenant-relevance-memory'),
      workspaceId: workspaceId('workspace-relevance-memory'),
      feedbackId: `feedback-${expectedKind}`,
      userId: 'user-relevance-memory',
      idempotencyKey: `feedback-key-${expectedKind}`,
      action: 'less_like_this',
      target: {
        topicId: 'topic-ai-tooling',
        providerKey: 'hacker-news',
        title: 'Ranking quality issue',
        bodyPreview,
      },
      learningDirection: 'negative',
      createdAt: new Date('2026-06-22T10:10:00.000Z'),
    }));

    const request = client.requests[0];
    expect((request?.metadata as Record<string, unknown> | undefined)?.ranking_feedback_kind).toBe(expectedKind);
    expect(request?.factTags).toContain(expectedTag);
  });

  it.each([
    ['not_same_story', 'possible_false_merge', 'ranking-feedback-false-merge'],
    ['duplicate', 'possible_duplicate_missed', 'ranking-feedback-duplicate-missed'],
    ['low_quality_source', 'low_quality_source', 'ranking-feedback-low-quality-source'],
    ['overrated_provider', 'provider_overranked', 'ranking-feedback-provider-overranked'],
  ] as const)('classifies explicit feedback reason "%s"', async (feedbackReason, expectedKind, expectedTag) => {
    const client = new FakeMemoStackClient();
    const projector = new MemoStackRelevanceMemoryProjector({
      baseUrl: 'https://memory.example.test',
      token: 'test-token',
      client,
    });

    await projector.recordRelevanceFeedback(createRelevanceMemoryProjection({
      id: `projection-${feedbackReason}`,
      tenantId: tenantId('tenant-relevance-memory'),
      workspaceId: workspaceId('workspace-relevance-memory'),
      feedbackId: `feedback-${feedbackReason}`,
      userId: 'user-relevance-memory',
      idempotencyKey: `feedback-key-${feedbackReason}`,
      action: 'less_like_this',
      target: {
        topicId: 'topic-ai-tooling',
        providerKey: 'reddit',
        title: 'Reader marked a ranking problem',
        bodyPreview: 'Generic negative feedback without trigger phrases.',
        feedbackReason,
      },
      learningDirection: 'negative',
      createdAt: new Date('2026-06-22T10:15:00.000Z'),
    }));

    const request = client.requests[0];
    const metadata = request?.metadata as Record<string, unknown> | undefined;
    expect(metadata?.feedback_reason).toBe(feedbackReason);
    expect(metadata?.ranking_feedback_kind).toBe(expectedKind);
    expect(request?.factTags).toContain(expectedTag);
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
