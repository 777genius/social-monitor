import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import {
  MemoStackSummaryMemoryAdapter,
  spaceSlug,
  topicFeedbackScope,
} from './memo-stack-summary-memory.adapter';

type RecordedRequest = {
  readonly url: string;
  readonly init: RequestInit;
  readonly body: Record<string, unknown>;
};

const makeFetch = (
  responses: readonly Record<string, unknown>[],
  requests: RecordedRequest[],
): ((input: string | URL, init?: RequestInit) => Promise<Response>) => {
  let index = 0;

  return async (input, init) => {
    const response = responses[index] ?? {};
    index += 1;
    requests.push({
      url: input.toString(),
      init: init ?? {},
      body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
    });

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
};

const evidence = {
  sourceWindow: {
    windowId: 'window-1',
    startedAt: new Date('2026-06-06T00:00:00.000Z'),
    endedAt: new Date('2026-06-06T00:01:00.000Z'),
    selectedFeedItemIds: ['feed-1'],
  },
  items: [
    {
      feedItemId: 'feed-1',
      sourceItemId: 'source-1',
      sourceBindingId: 'binding-1',
      providerKey: 'github',
      title: 'GitHub issue about production auth',
      observedAt: new Date('2026-06-06T00:00:30.000Z'),
    },
  ],
};

describe('MemoStackSummaryMemoryAdapter', () => {
  it('records summary feedback as an idempotent memo-stack fact', async () => {
    const requests: RecordedRequest[] = [];
    const adapter = new MemoStackSummaryMemoryAdapter({
      baseUrl: 'https://memory.example.test/api/',
      token: ' test-token ',
      fetchFn: makeFetch([{ data: { indexing_status: 'queued' } }], requests),
    });

    const result = await adapter.recordSummaryFeedback({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      topicId: 'topic-1',
      summaryId: 'summary-1',
      feedbackId: 'feedback-1',
      idempotencyKey: 'feedback-key-1',
      submittedBy: 'user-1',
      rating: 2,
      category: 'bad_citation',
      comment: 'Citation points to the wrong claim.',
      citationId: 'citation-1',
      feedItemId: 'feed-1',
      sourceItemId: 'source-1',
      providerKey: 'github',
      createdAt: new Date('2026-06-06T00:10:00.000Z'),
    });

    expect(result).toEqual({
      status: 'written',
      diagnostics: {
        provider: 'memo-stack',
        responseStatus: 'queued',
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe('https://memory.example.test/api/v1/facts');
    expect(requests[0]?.init.headers).toMatchObject({
      authorization: 'Bearer test-token',
      'content-type': 'application/json',
      'idempotency-key': 'social-monitor:summary-feedback:tenant-1:workspace-1:feedback-key-1',
    });
    expect(requests[0]?.body).toMatchObject({
      space_slug: spaceSlug('tenant-1', 'workspace-1'),
      memory_scope_external_ref: topicFeedbackScope('topic-1'),
      kind: 'summary_feedback',
      classification: 'internal',
      category: 'summary_feedback',
      ttl_policy: 'durable',
      tags: ['summary-feedback', 'rating-2', 'category-bad_citation', 'provider-github'],
    });
    expect(requests[0]?.body.text).toEqual(expect.stringContaining('Citation points to the wrong claim.'));
    expect(requests[0]?.body.source_refs).toEqual([
      {
        source_type: 'social-monitor.summary-feedback',
        source_id: 'feedback-1',
        summary_id: 'summary-1',
        citation_id: 'citation-1',
        feed_item_id: 'feed-1',
        source_item_id: 'source-1',
        provider_key: 'github',
      },
    ]);
  });

  it('builds summary memory context with retrieval diagnostics passthrough', async () => {
    const requests: RecordedRequest[] = [];
    const adapter = new MemoStackSummaryMemoryAdapter({
      baseUrl: 'https://memory.example.test',
      token: 'test-token',
      fetchFn: makeFetch([
        {
          data: {
            rendered_text: 'Memory: prefer security fixes and cite durable evidence.',
            diagnostics: {
              vector_status: 'ok',
              graph_status: 'ok',
              query_decomposition_derived_query_count: 3,
            },
          },
        },
      ], requests),
    });

    const result = await adapter.buildContext({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      topicId: 'topic-1',
      userId: 'user-1',
      subscriptionId: 'subscription-1',
      evidence,
      requestedAt: new Date('2026-06-06T00:11:00.000Z'),
    });

    expect(result).toEqual({
      status: 'available',
      renderedText: 'Memory: prefer security fixes and cite durable evidence.',
      diagnostics: {
        vector_status: 'ok',
        graph_status: 'ok',
        query_decomposition_derived_query_count: 3,
      },
      retrievedAt: new Date('2026-06-06T00:11:00.000Z'),
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe('https://memory.example.test/v1/context');
    expect(requests[0]?.body).toMatchObject({
      space_slug: spaceSlug('tenant-1', 'workspace-1'),
      token_budget: 900,
      max_facts: 12,
      max_chunks: 8,
      consistency_mode: 'best_effort',
      include_stale: false,
    });
    expect(requests[0]?.body.memory_scope_external_refs).toEqual([
      topicFeedbackScope('topic-1'),
      'topic:topic-1:preferences',
      'user:user-1:preferences',
      'subscription:subscription-1:preferences',
      'workspace-global',
    ]);
    expect(requests[0]?.body.query).toEqual(expect.stringContaining('GitHub issue about production auth'));
  });

  it('falls back to topic feedback scope when optional preference scopes do not exist', async () => {
    const requests: RecordedRequest[] = [];
    const adapter = new MemoStackSummaryMemoryAdapter({
      baseUrl: 'https://memory.example.test',
      token: 'test-token',
      fetchFn: makeFetch([
        {
          data: {
            rendered_text: '',
            diagnostics: { scope_not_found: true },
          },
        },
        {
          data: {
            rendered_text: 'Fallback topic feedback memory.',
            diagnostics: { source: 'topic-feedback' },
          },
        },
      ], requests),
    });

    const result = await adapter.buildContext({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      topicId: 'topic-1',
      userId: 'user-1',
      subscriptionId: 'subscription-1',
      evidence,
      requestedAt: new Date('2026-06-06T00:11:00.000Z'),
    });

    expect(result).toEqual({
      status: 'available',
      renderedText: 'Fallback topic feedback memory.',
      diagnostics: {
        source: 'topic-feedback',
        fallbackFromScopeNotFound: true,
      },
      retrievedAt: new Date('2026-06-06T00:11:00.000Z'),
    });
    expect(requests).toHaveLength(2);
    expect(requests[1]?.body.memory_scope_external_refs).toEqual([topicFeedbackScope('topic-1')]);
  });
});
