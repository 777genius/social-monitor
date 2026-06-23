import assert from 'node:assert/strict';

import { InfinityContextClient } from '@infinity-context/sdk';

const requests = [];
const token = 'summary-memory-sdk-smoke-token';

const client = new InfinityContextClient({
  baseUrl: 'https://memory.example.test',
  token,
  retryPolicy: { maxAttempts: 1 },
  transport: {
    async send(request) {
      requests.push({
        method: request.method,
        path: request.url.pathname,
        authorization: request.headers.get('authorization'),
        idempotencyKey: request.headers.get('idempotency-key'),
        body: request.body?.kind === 'json' ? request.body.value : undefined,
      });

      if (request.url.pathname === '/v1/context') {
        return jsonResponse({
          data: {
            bundle_id: 'summary-memory-sdk-smoke-bundle',
            rendered_text: 'Memory context: prefer concise security summaries.',
            items: [],
            top_evidence: [],
            answer_support: {
              status: 'supported',
              items_returned: 0,
              coverage: {},
              policy: {},
              warnings: [],
            },
            diagnostics: {
              vector_status: 'ok',
              graph_status: 'ok',
            },
          },
        });
      }

      if (request.url.pathname === '/v1/captures') {
        return jsonResponse({
          data: {
            id: 'summary-memory-sdk-smoke-capture',
            duplicate: false,
            created_suggestions: 0,
            suggestion_ids: [],
            auto_applied_facts: 0,
            auto_applied_fact_ids: [],
          },
        });
      }

      if (request.url.pathname === '/v1/facts') {
        return jsonResponse({
          data: {
            id: 'summary-memory-sdk-smoke-fact',
            text: 'Prefer concise security summaries.',
            kind: 'summary_feedback',
            status: 'active',
            version: 1,
          },
        });
      }

      throw new Error(`Unexpected SDK smoke request ${request.method} ${request.url.pathname}`);
    },
  },
});

const context = await client.context.buildContext({
  spaceSlug: 'social-monitor:tenant-1:workspace-1',
  memoryScopeExternalRefs: ['topic:topic-1:feedback'],
  query: 'summary guidance topic:topic-1',
  tokenBudget: 64,
  maxFacts: 2,
  maxChunks: 2,
  consistencyMode: 'best_effort',
});

assert.equal(context.data.rendered_text, 'Memory context: prefer concise security summaries.');
assert.equal(context.data.diagnostics.vector_status, 'ok');

const feedback = await client.workflows.recordFeedback({
  spaceSlug: 'social-monitor:tenant-1:workspace-1',
  memoryScopeExternalRef: 'topic:topic-1:feedback',
  sourceAgent: 'social-monitor.summary-feedback',
  text: 'Summary feedback for topic topic-1: rating 2/5, category bad_citation.',
  idempotencyKey: 'summary-memory-sdk-smoke-feedback',
  sourceId: 'feedback-1',
  sourceRefs: [
    {
      source_type: 'social-monitor.summary-feedback',
      source_id: 'feedback-1',
    },
  ],
  rememberAsFact: true,
  factKind: 'summary_feedback',
  factCategory: 'summary_feedback',
  factTags: ['summary-feedback', 'category-bad_citation'],
  factTtlPolicy: 'durable',
});

assert.equal(feedback.capture.data.id, 'summary-memory-sdk-smoke-capture');
assert.equal(feedback.fact?.data.id, 'summary-memory-sdk-smoke-fact');
assert.deepEqual(requests.map((request) => `${request.method} ${request.path}`), [
  'POST /v1/context',
  'POST /v1/captures',
  'POST /v1/facts',
]);

for (const request of requests) {
  assert.equal(request.authorization, `Bearer ${token}`);
  assert(!JSON.stringify(request.body ?? {}).includes(token), 'SDK smoke token must not appear in JSON payloads');
}

assert.equal(requests[1].idempotencyKey, 'summary-memory-sdk-smoke-feedback');
assert.equal(requests[2].idempotencyKey, 'summary-memory-sdk-smoke-feedback:fact');

console.log('Summary memory SDK smoke OK');

function jsonResponse(payload) {
  return {
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    body: JSON.stringify(payload),
  };
}
