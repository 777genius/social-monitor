import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { summaryFeedbackCategories } from '../../domain';

import {
  memoStackWorkflowIdempotencyKey,
  MemoStackSummaryMemoryAdapter,
  providerQualityScope,
  spaceSlug,
  topicFeedbackScope,
  userPreferenceScope,
} from './memo-stack-summary-memory.adapter';
import { feedbackMemoryMapping } from './memo-stack-summary-feedback-memory';

type RecordedRequest = {
  readonly url: string;
  readonly init: RequestInit;
  readonly body: Record<string, unknown>;
};

const headerValue = (headers: HeadersInit | undefined, name: string): string | null =>
  new Headers(headers).get(name);

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
  it('uses memo-stack canonical fact kinds for every summary feedback category', () => {
    const supportedMemoStackKinds = new Set([
      'note',
      'architecture_decision',
      'constraint',
      'user_preference',
    ]);

    for (const category of summaryFeedbackCategories) {
      expect(supportedMemoStackKinds.has(feedbackMemoryMapping(category).factKind)).toBe(true);
    }
  });

  it('keeps memo-stack workflow idempotency keys inside API limits', () => {
    const key = memoStackWorkflowIdempotencyKey(
      'social-monitor',
      'summary-feedback',
      `tenant-${'t'.repeat(80)}`,
      `workspace-${'w'.repeat(80)}`,
      `request-${'r'.repeat(80)}`,
    );

    expect(key.length).toBeLessThanOrEqual(115);
    expect(key).toEqual(memoStackWorkflowIdempotencyKey(
      'social-monitor',
      'summary-feedback',
      `tenant-${'t'.repeat(80)}`,
      `workspace-${'w'.repeat(80)}`,
      `request-${'r'.repeat(80)}`,
    ));
    expect(key).toMatch(/:[0-9a-f]{32}$/);
  });

  it('records summary feedback as an idempotent memo-stack fact', async () => {
    const requests: RecordedRequest[] = [];
    const adapter = new MemoStackSummaryMemoryAdapter({
      baseUrl: 'https://memory.example.test/api/',
      token: ' token-value ',
      fetchFn: makeFetch([
        { data: { id: 'capture-1' } },
        { data: { id: 'fact-1', indexing_status: 'queued' } },
        { data: { id: 'provider-capture-1' } },
        { data: { id: 'provider-fact-1', indexing_status: 'queued' } },
        { data: { id: 'user-preference-capture-1' } },
        { data: { id: 'user-preference-fact-1', indexing_status: 'queued' } },
      ], requests),
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
        workflow: 'recordFeedback',
        captureId: 'capture-1',
        factId: 'fact-1',
        memoryScopeExternalRef: topicFeedbackScope('topic-1'),
        factMemoryScopeExternalRef: topicFeedbackScope('topic-1'),
        providerQualityCaptureId: 'provider-capture-1',
        providerQualityFactId: 'provider-fact-1',
        providerQualityScopeExternalRef: providerQualityScope('topic-1', 'github'),
        userPreferenceCaptureId: 'user-preference-capture-1',
        userPreferenceFactId: 'user-preference-fact-1',
        userPreferenceScopeExternalRef: userPreferenceScope('user-1'),
      },
    });
    expect(requests).toHaveLength(6);
    expect(requests[0]?.url).toBe('https://memory.example.test/api/v1/captures');
    expect(headerValue(requests[0]?.init.headers, 'authorization')).toBe('Bearer token-value');
    expect(headerValue(requests[0]?.init.headers, 'content-type')).toBe('application/json');
    expect(headerValue(requests[0]?.init.headers, 'idempotency-key')).toBe(
      'social-monitor:summary-feedback:tenant-1:workspace-1:feedback-key-1',
    );
    expect(requests[0]?.body).toMatchObject({
      space_slug: spaceSlug('tenant-1', 'workspace-1'),
      memory_scope_external_ref: topicFeedbackScope('topic-1'),
      source_agent: 'social-monitor.summary-feedback',
      source_kind: 'hook',
      event_type: 'social-monitor.summary_feedback.recorded',
      actor_role: 'user',
      source_event_id: 'feedback-1',
      source_actor_external_ref: 'user-1',
      trust_level: 'high',
      source_authority: 'user_statement',
      sensitivity: 'medium',
      data_classification: 'internal',
      idempotency_key: 'social-monitor:summary-feedback:tenant-1:workspace-1:feedback-key-1',
      consolidate: true,
      metadata: {
        summary_id: 'summary-1',
        topic_id: 'topic-1',
        rating: 2,
        category: 'bad_citation',
        provider_key: 'github',
        citation_id: 'citation-1',
        memory_action: 'improve_citation_precision',
        memory_fact_category: 'citation_quality',
        provider_quality_action: 'review_provider_citation_support',
        provider_quality_scope: providerQualityScope('topic-1', 'github'),
      },
    });
    expect(requests[0]?.body.text).toEqual(expect.stringContaining('Citation points to the wrong claim.'));
    expect(requests[0]?.body.text).toEqual(expect.stringContaining('tighten citation selection'));
    expect(requests[0]?.body.text).toEqual(expect.stringContaining('Provider quality lesson'));
    expect(requests[0]?.body.text).toEqual(expect.stringContaining('github evidence as needing stricter citation support'));
    expect(requests[0]?.body.evidence_refs).toEqual([
      {
        source_type: 'social-monitor.summary-feedback',
        source_id: 'feedback-1',
      },
      {
        source_type: 'social-monitor.summary',
        source_id: 'summary-1',
      },
      {
        source_type: 'social-monitor.citation',
        source_id: 'citation-1',
      },
      {
        source_type: 'social-monitor.feed-item',
        source_id: 'feed-1',
      },
      {
        source_type: 'social-monitor.source-item',
        source_id: 'source-1',
      },
    ]);
    expect(requests[1]?.url).toBe('https://memory.example.test/api/v1/facts');
    expect(headerValue(requests[1]?.init.headers, 'authorization')).toBe('Bearer token-value');
    expect(headerValue(requests[1]?.init.headers, 'content-type')).toBe('application/json');
    expect(headerValue(requests[1]?.init.headers, 'idempotency-key')).toBe(
      'social-monitor:summary-feedback:tenant-1:workspace-1:feedback-key-1:fact',
    );
    expect(requests[1]?.body).toMatchObject({
      space_slug: spaceSlug('tenant-1', 'workspace-1'),
      memory_scope_external_ref: topicFeedbackScope('topic-1'),
      kind: 'user_preference',
      classification: 'internal',
      category: 'user_preferences',
      ttl_policy: 'durable',
      tags: [
        'summary-feedback',
        'rating-2',
        'category-bad_citation',
        'citation-quality',
        'validator-signal',
        'provider-github',
      ],
    });
    expect(requests[1]?.body.text).toEqual(expect.stringContaining('Citation points to the wrong claim.'));
    expect(requests[1]?.body.text).toEqual(expect.stringContaining('tighten citation selection'));
    expect(requests[1]?.body.text).toEqual(expect.stringContaining('github evidence as needing stricter citation support'));
    expect(requests[1]?.body.source_refs).toEqual([
      {
        source_type: 'capture',
        source_id: 'capture-1',
      },
      {
        source_type: 'social-monitor.summary-feedback',
        source_id: 'feedback-1',
      },
      {
        source_type: 'social-monitor.summary',
        source_id: 'summary-1',
      },
      {
        source_type: 'social-monitor.citation',
        source_id: 'citation-1',
      },
      {
        source_type: 'social-monitor.feed-item',
        source_id: 'feed-1',
      },
      {
        source_type: 'social-monitor.source-item',
        source_id: 'source-1',
      },
    ]);
    expect(requests[2]?.url).toBe('https://memory.example.test/api/v1/captures');
    expect(requests[2]?.body).toMatchObject({
      space_slug: spaceSlug('tenant-1', 'workspace-1'),
      memory_scope_external_ref: providerQualityScope('topic-1', 'github'),
      source_agent: 'social-monitor.summary-provider-quality',
      event_type: 'social-monitor.summary_feedback.provider_quality_recorded',
      source_event_id: 'feedback-1:provider-quality',
      metadata: {
        parent_feedback_id: 'feedback-1',
        summary_id: 'summary-1',
        topic_id: 'topic-1',
        rating: 2,
        category: 'bad_citation',
        provider_key: 'github',
        citation_id: 'citation-1',
        memory_action: 'review_provider_citation_support',
        memory_fact_category: 'provider_quality',
        provider_quality_action: 'review_provider_citation_support',
        provider_quality_scope: providerQualityScope('topic-1', 'github'),
      },
    });
    expect(requests[3]?.url).toBe('https://memory.example.test/api/v1/facts');
    expect(requests[3]?.body).toMatchObject({
      space_slug: spaceSlug('tenant-1', 'workspace-1'),
      memory_scope_external_ref: providerQualityScope('topic-1', 'github'),
      kind: 'user_preference',
      classification: 'internal',
      category: 'user_preferences',
      ttl_policy: 'durable',
      tags: [
        'summary-feedback',
        'rating-2',
        'category-bad_citation',
        'provider-quality',
        'provider-citation-review',
        'provider-github',
      ],
    });
    expect(requests[3]?.body.source_refs).toEqual(expect.arrayContaining([
      {
        source_type: 'social-monitor.summary-feedback',
        source_id: 'feedback-1',
      },
      {
        source_type: 'social-monitor.citation',
        source_id: 'citation-1',
      },
    ]));
    expect(requests[4]?.url).toBe('https://memory.example.test/api/v1/captures');
    expect(requests[4]?.body).toMatchObject({
      space_slug: spaceSlug('tenant-1', 'workspace-1'),
      memory_scope_external_ref: userPreferenceScope('user-1'),
      source_agent: 'social-monitor.summary-feedback-user-preference',
      event_type: 'social-monitor.summary_feedback.user_preference_recorded',
      source_event_id: 'feedback-1:user-preference',
      metadata: {
        parent_feedback_id: 'feedback-1',
        summary_id: 'summary-1',
        topic_id: 'topic-1',
        rating: 2,
        category: 'bad_citation',
        provider_key: 'github',
        citation_id: 'citation-1',
        memory_action: 'downrank_similar_provider_evidence',
        memory_fact_category: 'relevance_quality',
        memory_scope_external_ref: userPreferenceScope('user-1'),
      },
    });
    expect(requests[4]?.body.text).toEqual(expect.stringContaining('down-rank similar github evidence'));
    expect(requests[4]?.body.text).not.toEqual(expect.stringContaining('Provider github was involved'));
    expect(requests[5]?.url).toBe('https://memory.example.test/api/v1/facts');
    expect(requests[5]?.body).toMatchObject({
      space_slug: spaceSlug('tenant-1', 'workspace-1'),
      memory_scope_external_ref: userPreferenceScope('user-1'),
      kind: 'user_preference',
      category: 'user_preferences',
      ttl_policy: 'durable',
      tags: [
        'summary-feedback',
        'user-preference',
        'rating-2',
        'category-bad_citation',
        'relevance-quality',
        'ranking-downrank-provider',
        'provider-github',
      ],
    });
    expect(requests[5]?.body.text).toEqual(expect.stringContaining('down-rank similar github evidence'));
  });

  it('skips low-signal positive generic feedback without calling memo-stack', async () => {
    const requests: RecordedRequest[] = [];
    const adapter = new MemoStackSummaryMemoryAdapter({
      baseUrl: 'https://memory.example.test',
      token: 'token-value',
      fetchFn: makeFetch([], requests),
    });

    const result = await adapter.recordSummaryFeedback({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      topicId: 'topic-1',
      summaryId: 'summary-1',
      feedbackId: 'feedback-1',
      idempotencyKey: 'feedback-key-1',
      submittedBy: 'user-1',
      rating: 5,
      category: 'other',
      createdAt: new Date('2026-06-06T00:10:00.000Z'),
    });

    expect(result).toEqual({
      status: 'skipped',
      diagnostics: { reason: 'low_signal_feedback' },
    });
    expect(requests).toHaveLength(0);
  });

  it('records provider quality lessons from explicit feedback text', async () => {
    const requests: RecordedRequest[] = [];
    const adapter = new MemoStackSummaryMemoryAdapter({
      baseUrl: 'https://memory.example.test',
      token: 'token-value',
      fetchFn: makeFetch([
        { data: { id: 'capture-1' } },
        { data: { id: 'fact-1' } },
        { data: { id: 'provider-capture-1' } },
        { data: { id: 'provider-fact-1' } },
        { data: { id: 'user-preference-capture-1' } },
        { data: { id: 'user-preference-fact-1' } },
      ], requests),
    });

    await adapter.recordSummaryFeedback({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      topicId: 'topic-1',
      summaryId: 'summary-1',
      feedbackId: 'feedback-1',
      idempotencyKey: 'feedback-key-1',
      submittedBy: 'user-1',
      rating: 2,
      category: 'too_verbose',
      comment: 'Make this shorter and down-rank low-signal Reddit posts.',
      citationId: 'citation-2',
      feedItemId: 'feed-2',
      sourceItemId: 'source-2',
      providerKey: 'reddit',
      createdAt: new Date('2026-06-06T00:10:00.000Z'),
    });

    expect(requests[0]?.body.metadata).toMatchObject({
      provider_key: 'reddit',
      provider_quality_action: 'downrank_low_signal_provider',
      provider_quality_scope: providerQualityScope('topic-1', 'reddit'),
      memory_action: 'prefer_shorter_summary',
    });
    expect(requests[1]?.body.memory_scope_external_ref).toBe(topicFeedbackScope('topic-1'));
    expect(requests[1]?.body.tags).toEqual(expect.arrayContaining([
      'style-shorter',
      'provider-reddit',
    ]));
    expect(requests[1]?.body.tags).not.toEqual(expect.arrayContaining(['provider-downrank']));
    expect(requests[3]?.body.memory_scope_external_ref).toBe(providerQualityScope('topic-1', 'reddit'));
    expect(requests[3]?.body.tags).toEqual(expect.arrayContaining([
      'provider-quality',
      'provider-downrank',
      'provider-reddit',
    ]));
    expect(requests[3]?.body.text).toEqual(expect.stringContaining('down-rank low-signal reddit evidence'));
    expect(requests[5]?.body.memory_scope_external_ref).toBe(userPreferenceScope('user-1'));
    expect(requests[5]?.body.tags).toEqual(expect.arrayContaining([
      'user-preference',
      'ranking-downrank-provider',
      'provider-reddit',
    ]));
    expect(requests[5]?.body.text).toEqual(expect.stringContaining('down-rank similar reddit evidence'));
    expect(requests[5]?.body.text).not.toEqual(expect.stringContaining('Provider reddit was involved'));
  });

  it('builds summary memory context with retrieval diagnostics passthrough', async () => {
    const requests: RecordedRequest[] = [];
    const adapter = new MemoStackSummaryMemoryAdapter({
      baseUrl: 'https://memory.example.test',
      token: 'token-value',
      fetchFn: makeFetch([
        {
          data: {
            rendered_text: 'Memory: prefer security fixes and cite durable evidence.',
            items: [
              {
                item_id: 'memory-item-1',
                item_type: 'fact',
                text: 'Prefer security fixes.',
                score: 0.92,
                source_refs: [
                  {
                    source_type: 'social-monitor.summary-feedback',
                    source_id: 'feedback-1',
                  },
                ],
              },
            ],
            top_evidence: [],
            answer_support: {
              status: 'supported',
              items_returned: 1,
              coverage: {},
              policy: {},
              warnings: ['preference-memory-only'],
            },
            diagnostics: {
              vector_status: 'ok',
              graph_status: 'ok',
              rag_status: 'ok',
              retrieval_sources_used: ['vector', 'graph'],
              retrieval_sources_total: 2,
              retrieval_sources_returned: 2,
              items_considered: 5,
              items_used: 1,
              facts_considered: 4,
              facts_used: 1,
              source_refs_total: 1,
              source_refs_returned: 1,
              stale_facts_considered: 1,
              stale_facts_used: 0,
              stale_vector_drop_count: 1,
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
      sourceRefs: [
        {
          source_type: 'social-monitor.summary-feedback',
          source_id: 'feedback-1',
        },
      ],
      retrieval: {
        vectorStatus: 'ok',
        graphStatus: 'ok',
        ragStatus: 'ok',
        retrievalSourcesUsed: ['vector', 'graph'],
        retrievalSourcesTotal: 2,
        retrievalSourcesReturned: 2,
        itemsConsidered: 5,
        itemsUsed: 1,
        factsConsidered: 4,
        factsUsed: 1,
        sourceRefsTotal: 1,
        sourceRefsReturned: 1,
      },
      staleMarkers: {
        staleFactsConsidered: 1,
        staleFactsUsed: 0,
        staleVectorDropCount: 1,
      },
      support: {
        status: 'supported',
        itemsReturned: 1,
        warnings: ['preference-memory-only'],
      },
      diagnostics: {
        vector_status: 'ok',
        graph_status: 'ok',
        rag_status: 'ok',
        retrieval_sources_used: ['vector', 'graph'],
        retrieval_sources_total: 2,
        retrieval_sources_returned: 2,
        items_considered: 5,
        items_used: 1,
        facts_considered: 4,
        facts_used: 1,
        source_refs_total: 1,
        source_refs_returned: 1,
        stale_facts_considered: 1,
        stale_facts_used: 0,
        stale_vector_drop_count: 1,
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
    });
    expect(requests[0]?.body).not.toHaveProperty('include_stale');
    expect(requests[0]?.body.memory_scope_external_refs).toEqual([
      'subscription:subscription-1:preferences',
      'user:user-1:preferences',
      'topic:topic-1:preferences',
      'workspace-global',
      providerQualityScope('topic-1', 'github'),
      topicFeedbackScope('topic-1'),
    ]);
    expect(requests[0]?.body.query).toEqual(expect.stringContaining('GitHub issue about production auth'));
    expect(requests[0]?.body.query).toEqual(expect.stringContaining('provider distribution: github=1'));
  });

  it('falls back to topic feedback scope when optional preference scopes do not exist', async () => {
    const requests: RecordedRequest[] = [];
    const adapter = new MemoStackSummaryMemoryAdapter({
      baseUrl: 'https://memory.example.test',
      token: 'token-value',
      fetchFn: makeFetch([
        {
          data: {
            rendered_text: '',
            diagnostics: { scope_not_found: true },
          },
        },
        {
          data: {
            rendered_text: 'Fallback provider quality memory.',
            items: [
              {
                item_id: 'provider-quality-fact-1',
                item_type: 'fact',
                text: 'Provider quality prefers GitHub security evidence.',
                source_refs: [
                  {
                    source_type: 'social-monitor.summary-feedback',
                    source_id: 'feedback-provider-quality',
                  },
                ],
              },
            ],
            answer_support: {
              status: 'partial',
              items_returned: 1,
              warnings: ['provider-quality-only'],
            },
            diagnostics: {
              vector_status: 'ok',
              retrieval_sources_used: ['vector'],
              retrieval_sources_total: 1,
              retrieval_sources_returned: 1,
              items_considered: 2,
              items_used: 1,
              facts_considered: 2,
              facts_used: 1,
              source_refs_total: 1,
              source_refs_returned: 1,
              stale_facts_considered: 1,
              stale_facts_used: 1,
            },
          },
        },
        {
          data: {
            rendered_text: 'Fallback topic feedback memory.',
            answer_support: {
              status: 'supported',
              items_returned: 1,
              warnings: ['topic-feedback-only'],
            },
            diagnostics: {
              graph_status: 'ok',
              retrieval_sources_used: ['graph'],
              retrieval_sources_total: 1,
              retrieval_sources_returned: 1,
              items_considered: 3,
              items_used: 1,
              facts_considered: 3,
              facts_used: 1,
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
      renderedText: 'Fallback provider quality memory.\nFallback topic feedback memory.',
      sourceRefs: [
        {
          source_type: 'social-monitor.summary-feedback',
          source_id: 'feedback-provider-quality',
        },
      ],
      retrieval: {
        vectorStatus: 'ok',
        graphStatus: 'ok',
        retrievalSourcesUsed: ['vector', 'graph'],
        retrievalSourcesTotal: 2,
        retrievalSourcesReturned: 2,
        itemsConsidered: 5,
        itemsUsed: 2,
        factsConsidered: 5,
        factsUsed: 2,
        sourceRefsTotal: 1,
        sourceRefsReturned: 1,
      },
      staleMarkers: {
        staleFactsConsidered: 1,
        staleFactsUsed: 1,
      },
      support: {
        status: 'partial,supported',
        itemsReturned: 2,
        warnings: ['provider-quality-only', 'topic-feedback-only'],
      },
      diagnostics: {
        fallbackFromScopeNotFound: true,
        fallbackScopesUsed: 2,
      },
      retrievedAt: new Date('2026-06-06T00:11:00.000Z'),
    });
    expect(requests).toHaveLength(3);
    expect(requests[1]?.body.memory_scope_external_refs).toEqual([
      providerQualityScope('topic-1', 'github'),
    ]);
    expect(requests[2]?.body.memory_scope_external_refs).toEqual([
      topicFeedbackScope('topic-1'),
    ]);
  });
});
