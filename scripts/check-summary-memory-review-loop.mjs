import assert from 'node:assert/strict';

import {
  createMemoryReviewPlan,
  InfinityContextClient,
} from '@infinity-context/sdk';

const requests = [];
const client = new InfinityContextClient({
  baseUrl: 'https://memory.example.test',
  token: 'summary-memory-review-smoke-token',
  retryPolicy: { maxAttempts: 1 },
  transport: {
    async send(request) {
      const body = request.body?.kind === 'json' ? request.body.value : undefined;
      requests.push({
        method: request.method,
        path: request.url.pathname,
        idempotencyKey: request.headers.get('idempotency-key'),
        body,
      });

      if (request.method === 'POST' && request.url.pathname === '/v1/context-link-suggestions/review-batch') {
        return jsonResponse({
          data: {
            applied: 1,
            failed: 1,
            stopped: false,
            results: [],
          },
        });
      }

      if (request.method === 'POST' && request.url.pathname === '/v1/suggestions/review-batch') {
        return jsonResponse({
          data: {
            applied: 1,
            failed: 0,
            stopped: false,
            results: [],
          },
        });
      }

      if (request.method === 'GET' && request.url.pathname === '/v1/context-link-suggestions') {
        return jsonResponse({
          data: [
            { id: 'context-link-suggestion-1' },
            { id: 'context-link-suggestion-2' },
          ],
        });
      }

      if (request.method === 'GET' && request.url.pathname === '/v1/suggestions') {
        return jsonResponse({
          data: [
            { id: 'memory-suggestion-1' },
          ],
        });
      }

      throw new Error(`Unexpected memory review smoke request ${request.method} ${request.url.pathname}`);
    },
  },
});

const plan = createMemoryReviewPlan({
  reason: 'summary-memory-review-smoke',
  continueOnError: true,
  contextLinks: {
    action: 'approve',
    items: [
      {
        suggestionId: 'context-link-suggestion-1',
        targetType: 'fact',
        targetId: 'fact-1',
        relationType: 'supports',
        confidence: 'high',
        linkReason: 'Connect feedback preference to durable source evidence.',
      },
      {
        suggestionId: 'context-link-suggestion-2',
        action: 'reject',
        reason: 'No longer relevant to summary topic.',
      },
    ],
  },
  suggestions: {
    action: 'approve',
    force: false,
    items: [
      {
        suggestionId: 'memory-suggestion-1',
      },
    ],
  },
});

assert.equal(plan.summary.total, 3);
assert.equal(plan.summary.contextLinkReviews, 2);
assert.equal(plan.summary.suggestionReviews, 1);
assert.equal(plan.summary.byAction.approve, 2);
assert.equal(plan.summary.byAction.reject, 1);

const reviewResult = await client.workflows.applyMemoryReviewPlan(plan);
assert.equal(reviewResult.summary.applied, 2);
assert.equal(reviewResult.summary.failed, 1);
assert.equal(reviewResult.summary.stopped, false);
assert.equal(reviewResult.diagnostics.ok, false);
assert.deepEqual(reviewResult.diagnostics.warnings, ['context link review failed 1 item(s)']);

const maintenance = await client.workflows.planMemoryMaintenance({
  spaceSlug: 'social-monitor:tenant-1:workspace-1',
  memoryScopeExternalRef: 'topic:topic-1:feedback',
  includeOperations: false,
  includeContextLinkSuggestions: true,
  includeMemorySuggestions: true,
  includeAnchorMergeCandidates: false,
  includeCaptureDiagnostics: false,
  includeExtractionJobs: false,
  continueOnError: false,
  limit: 10,
});

assert.equal(maintenance.summary.totalActionable, 3);
assert.equal(maintenance.summary.contextLinkSuggestions, 2);
assert.equal(maintenance.summary.memorySuggestions, 1);
assert.deepEqual(
  maintenance.summary.suggestedActions.map((action) => action.kind),
  ['review_context_links', 'resolve_memory_suggestions'],
);
assert.equal(maintenance.diagnostics.partial, false);

assert.deepEqual(requests.map((request) => `${request.method} ${request.path}`), [
  'POST /v1/context-link-suggestions/review-batch',
  'POST /v1/suggestions/review-batch',
  'GET /v1/context-link-suggestions',
  'GET /v1/suggestions',
]);
for (const request of requests) {
  assert(!JSON.stringify(request.body ?? {}).includes('summary-memory-review-smoke-token'));
}

console.log('Summary memory review loop OK');

function jsonResponse(payload) {
  return {
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    body: JSON.stringify(payload),
  };
}
