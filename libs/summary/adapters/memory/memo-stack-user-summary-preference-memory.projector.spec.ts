import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import {
  spaceSlug,
  subscriptionPreferenceScope,
  userPreferenceScope,
} from './memo-stack-summary-memory.adapter';
import { MemoStackUserSummaryPreferenceMemoryProjector } from './memo-stack-user-summary-preference-memory.projector';

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

describe('MemoStackUserSummaryPreferenceMemoryProjector', () => {
  it('records topic-level user preferences into the user preference scope', async () => {
    const requests: RecordedRequest[] = [];
    const projector = new MemoStackUserSummaryPreferenceMemoryProjector({
      baseUrl: 'https://memory.example.test/api',
      token: 'test-token',
      fetchFn: makeFetch([
        { data: { id: 'capture-1' } },
        { data: { id: 'fact-1' } },
      ], requests),
    });

    const result = await projector.recordUserSummaryPreference({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      preferenceId: 'preference-1',
      userId: 'user-1',
      topicId: 'topic-1',
      language: 'ru',
      format: 'bullet_digest',
      tone: 'concise',
      maxKeyPoints: 4,
      includeRisks: true,
      includeSourceHighlights: true,
      customInstructions: 'Prefer product launch signals.',
      rulesVersion: 'summary.rules.user-preference.v1',
      createdAt: new Date('2026-06-21T10:00:00.000Z'),
      updatedAt: new Date('2026-06-21T11:00:00.000Z'),
    });

    expect(result).toEqual({
      status: 'written',
      diagnostics: {
        provider: 'memo-stack',
        workflow: 'recordFeedback',
        memoryScopeExternalRef: userPreferenceScope('user-1'),
        captureId: 'capture-1',
        factId: 'fact-1',
      },
    });
    expect(requests).toHaveLength(2);
    expect(requests[0]?.url).toBe('https://memory.example.test/api/v1/captures');
    expect(headerValue(requests[0]?.init.headers, 'authorization')).toBe('Bearer test-token');
    expect(headerValue(requests[0]?.init.headers, 'idempotency-key')).toBe(
      'social-monitor:user-summary-preference:tenant-1:workspace-1:preference-1:2026-06-21T11:00:00.000Z',
    );
    expect(requests[0]?.body).toMatchObject({
      space_slug: spaceSlug('tenant-1', 'workspace-1'),
      memory_scope_external_ref: userPreferenceScope('user-1'),
      source_agent: 'social-monitor.user-summary-preference',
      source_kind: 'hook',
      event_type: 'social-monitor.user_summary_preference.upserted',
      actor_role: 'user',
      source_event_id: 'preference-1',
      source_actor_external_ref: 'user-1',
      trust_level: 'high',
      source_authority: 'user_statement',
      sensitivity: 'medium',
      data_classification: 'internal',
    });
    expect(requests[0]?.body.text).toEqual(expect.stringContaining('language=ru'));
    expect(requests[0]?.body.text).toEqual(expect.stringContaining('custom_instructions=Prefer product launch signals.'));
    expect(requests[0]?.body.evidence_refs).toEqual([
      {
        source_type: 'social-monitor.user-summary-preference',
        source_id: 'preference-1',
      },
    ]);
    expect(requests[1]?.url).toBe('https://memory.example.test/api/v1/facts');
    expect(headerValue(requests[1]?.init.headers, 'idempotency-key')).toBe(
      'social-monitor:user-summary-preference:tenant-1:workspace-1:preference-1:2026-06-21T11:00:00.000Z:fact',
    );
    expect(requests[1]?.body).toMatchObject({
      space_slug: spaceSlug('tenant-1', 'workspace-1'),
      memory_scope_external_ref: userPreferenceScope('user-1'),
      kind: 'user_preference',
      category: 'summary_preference',
      ttl_policy: 'durable',
      tags: [
        'summary-preference',
        'explicit-user-preference',
        'user-preference',
        'rules-summary.rules.user-preference.v1',
        'language-ru',
        'format-bullet_digest',
        'tone-concise',
      ],
    });
    expect(requests[1]?.body.source_refs).toEqual([
      {
        source_type: 'capture',
        source_id: 'capture-1',
      },
      {
        source_type: 'social-monitor.user-summary-preference',
        source_id: 'preference-1',
      },
    ]);
  });

  it('records subscription-level preferences into the subscription preference scope', async () => {
    const requests: RecordedRequest[] = [];
    const projector = new MemoStackUserSummaryPreferenceMemoryProjector({
      baseUrl: 'https://memory.example.test',
      token: 'test-token',
      fetchFn: makeFetch([
        { data: { id: 'capture-1' } },
        { data: { id: 'fact-1' } },
      ], requests),
    });

    await projector.recordUserSummaryPreference({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      preferenceId: 'preference-1',
      userId: 'user-1',
      subscriptionId: 'subscription-1',
      tone: 'analytical',
      rulesVersion: 'summary.rules.user-preference.v1',
      createdAt: new Date('2026-06-21T10:00:00.000Z'),
      updatedAt: new Date('2026-06-21T11:00:00.000Z'),
    });

    expect(requests[0]?.body).toMatchObject({
      memory_scope_external_ref: subscriptionPreferenceScope('subscription-1'),
    });
    expect(requests[1]?.body).toMatchObject({
      memory_scope_external_ref: subscriptionPreferenceScope('subscription-1'),
      tags: expect.arrayContaining(['subscription-preference', 'tone-analytical']),
    });
  });

  it('skips empty preferences without calling memo-stack', async () => {
    const requests: RecordedRequest[] = [];
    const projector = new MemoStackUserSummaryPreferenceMemoryProjector({
      baseUrl: 'https://memory.example.test',
      token: 'test-token',
      fetchFn: makeFetch([], requests),
    });

    const result = await projector.recordUserSummaryPreference({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      preferenceId: 'preference-1',
      userId: 'user-1',
      topicId: 'topic-1',
      rulesVersion: 'summary.rules.user-preference.v1',
      createdAt: new Date('2026-06-21T10:00:00.000Z'),
      updatedAt: new Date('2026-06-21T11:00:00.000Z'),
    });

    expect(result).toEqual({
      status: 'skipped',
      diagnostics: { reason: 'empty_summary_preference' },
    });
    expect(requests).toHaveLength(0);
  });
});
