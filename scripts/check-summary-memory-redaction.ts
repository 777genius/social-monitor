import assert from 'node:assert/strict';

import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import {
  MemoStackSummaryMemoryAdapter,
  userPreferenceScope,
} from '@social-monitor/summary/adapters/memory/memo-stack-summary-memory.adapter';
import { MemoStackUserSummaryPreferenceMemoryProjector } from '@social-monitor/summary/adapters/memory/memo-stack-user-summary-preference-memory.projector';

type RecordedRequest = {
  readonly url: string;
  readonly authorization: string | null;
  readonly body: Record<string, unknown>;
};

const token = 'summary-memory-redaction-token-secret';
const rawSecretFragments = [
  token,
  'memory-query-leak',
  'title-leak',
  'feedback-leak',
  'token-value',
  'preference-leak',
  'preference-key-leak',
];
const requests: RecordedRequest[] = [];
const fetchFn = async (input: string | URL, init?: RequestInit): Promise<Response> => {
  const url = input.toString();
  requests.push({
    url,
    authorization: new Headers(init?.headers).get('authorization'),
    body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
  });

  const path = new URL(url).pathname;
  if (path.endsWith('/v1/context')) {
    return jsonResponse({
      data: {
        rendered_text: 'Memory context: prefer concise security summaries.',
        diagnostics: { vector_status: 'ok', graph_status: 'ok' },
      },
    });
  }
  if (path.endsWith('/v1/captures')) {
    return jsonResponse({ data: { id: `capture-${requests.length}` } });
  }
  if (path.endsWith('/v1/facts')) {
    return jsonResponse({ data: { id: `fact-${requests.length}` } });
  }

  throw new Error(`Unexpected summary memory redaction request ${path}`);
};

const adapter = new MemoStackSummaryMemoryAdapter({
  baseUrl: 'https://memory.example.test/api/',
  token,
  fetchFn,
});
const projector = new MemoStackUserSummaryPreferenceMemoryProjector({
  baseUrl: 'https://memory.example.test/api/',
  token,
  fetchFn,
});

void main();

async function main(): Promise<void> {
  await adapter.buildContext({
    tenantId: tenantId('tenant-redaction'),
    workspaceId: workspaceId('workspace-redaction'),
    topicId: 'topic-redaction',
    userId: 'user-redaction',
    subscriptionId: 'subscription-redaction',
    evidence: {
      sourceWindow: {
        windowId: 'window-redaction',
        startedAt: new Date('2026-06-06T00:00:00.000Z'),
        endedAt: new Date('2026-06-06T00:01:00.000Z'),
        selectedFeedItemIds: ['feed-redaction-github', 'feed-redaction-reddit'],
      },
      items: [
        {
          feedItemId: 'feed-redaction-github',
          sourceItemId: 'source-redaction-github',
          sourceBindingId: 'binding-redaction-github',
          providerKey: 'github',
          title: 'GitHub token=memory-query-leak security issue',
          observedAt: new Date('2026-06-06T00:00:30.000Z'),
        },
        {
          feedItemId: 'feed-redaction-reddit',
          sourceItemId: 'source-redaction-reddit',
          sourceBindingId: 'binding-redaction-reddit',
          providerKey: 'reddit',
          title: 'Reddit discussion access_token=title-leak about scans',
          observedAt: new Date('2026-06-06T00:00:40.000Z'),
        },
      ],
    },
    requestedAt: new Date('2026-06-06T00:02:00.000Z'),
  });

  await adapter.recordSummaryFeedback({
    tenantId: tenantId('tenant-redaction'),
    workspaceId: workspaceId('workspace-redaction'),
    topicId: 'topic-redaction',
    summaryId: 'summary-redaction',
    feedbackId: 'feedback-redaction',
    idempotencyKey: 'feedback-redaction-key',
    submittedBy: 'user-redaction',
    rating: 2,
    category: 'bad_citation',
    comment: 'Citation leaked secret=feedback-leak and Bearer token-value placeholder.',
    citationId: 'citation-redaction',
    feedItemId: 'feed-redaction-github',
    sourceItemId: 'source-redaction-github',
    providerKey: 'github',
    createdAt: new Date('2026-06-06T00:03:00.000Z'),
  });

  await projector.recordUserSummaryPreference({
    tenantId: tenantId('tenant-redaction'),
    workspaceId: workspaceId('workspace-redaction'),
    preferenceId: 'preference-redaction',
    userId: 'user-redaction',
    subscriptionId: 'subscription-redaction',
    topicId: 'topic-redaction',
    language: 'en',
    format: 'bullet_digest',
    tone: 'concise',
    maxKeyPoints: 5,
    includeRisks: true,
    includeSourceHighlights: true,
    customInstructions: 'Focus on security, token=preference-leak and private_key=preference-key-leak.',
    rulesVersion: 'summary-policy.v1',
    createdAt: new Date('2026-06-06T00:04:00.000Z'),
    updatedAt: new Date('2026-06-06T00:04:00.000Z'),
  });

  assert.equal(requests.length, 9, 'summary memory redaction check must exercise context, feedback, provider quality, user feedback preference and explicit preference writes');
  assert.deepEqual(requests.map((request) => new URL(request.url).pathname), [
    '/api/v1/context',
    '/api/v1/captures',
    '/api/v1/facts',
    '/api/v1/captures',
    '/api/v1/facts',
    '/api/v1/captures',
    '/api/v1/facts',
    '/api/v1/captures',
    '/api/v1/facts',
  ]);

  for (const request of requests) {
    assert.equal(request.authorization, `Bearer ${token}`);
  }

  const serializedUrls = requests.map((request) => request.url).join('\n');
  const serializedBodies = requests.map((request) => JSON.stringify(request.body)).join('\n');
  for (const rawSecret of rawSecretFragments) {
    assert(!serializedUrls.includes(rawSecret), `raw secret leaked to memo-stack URL: ${rawSecret}`);
    assert(!serializedBodies.includes(rawSecret), `raw secret leaked to memo-stack JSON body: ${rawSecret}`);
  }

  assert(serializedBodies.includes('[REDACTED]'), 'redaction marker must prove text sanitization happened');
  assert(
    serializedBodies.includes('provider distribution: github=1, reddit=1'),
    'memory query must include provider distribution without leaking raw source secrets',
  );
  assert.equal(
    requests[5]?.body.memory_scope_external_ref,
    userPreferenceScope('user-redaction'),
    'summary feedback must write user-scope preference memory for later ranking guidance',
  );
  assert.equal(
    requests[6]?.body.memory_scope_external_ref,
    userPreferenceScope('user-redaction'),
    'summary feedback user-scope fact must be durable preference memory',
  );
  assert(
    JSON.stringify(requests[6]?.body).includes('down-rank similar github evidence'),
    'summary feedback user-scope fact must use relevance-readable downrank wording',
  );
  assert(
    !JSON.stringify(requests[6]?.body).includes('Provider github was involved'),
    'summary feedback user-scope fact must not accidentally boost low-quality provider evidence',
  );

  console.log('Summary memory redaction OK');
}

function jsonResponse(payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
