import {
  tenantId,
  workspaceId,
} from '@social-monitor/shared-kernel';

import { defaultSummaryGenerationPolicy } from '../../domain';
import type { SummaryModelInput } from '../../ports';
import {
  buildInstructions,
  buildPromptPayload,
} from './openai-responses-summary-prompt';

describe('openai-responses summary prompt', () => {
  it('keeps ranked conversation comments distinct from ancestry context', () => {
    const input = summaryInput();
    const instructions = buildInstructions(input);
    const payload = JSON.parse(buildPromptPayload(input)) as {
      readonly evidence: readonly [
        {
          readonly conversationContext: {
            readonly units: readonly [
              {
                readonly selectionReason: string;
                readonly ancestry: readonly [{ readonly selectionReason: string }];
              },
            ];
          };
        },
      ];
    };

    expect(instructions).toContain(
      'selectionReason=ranked marks discussion evidence',
    );
    expect(instructions).toContain(
      'ancestry contains parent comments for context only',
    );
    expect(
      payload.evidence[0].conversationContext.units[0].selectionReason,
    ).toBe('ranked');
    expect(
      payload.evidence[0].conversationContext.units[0].ancestry[0]
        .selectionReason,
    ).toBe('ancestor_context');
  });
});

const summaryInput = (): SummaryModelInput => ({
  tenantId: tenantId('tenant-summary-prompt'),
  workspaceId: workspaceId('workspace-summary-prompt'),
  interestId: 'interest-ai-devtools',
  evidence: {
    sourceWindow: {
      windowId: 'window-1',
      startedAt: new Date('2026-06-05T12:00:00.000Z'),
      endedAt: new Date('2026-06-05T12:05:00.000Z'),
      selectedFeedItemIds: ['feed-post-1'],
    },
    items: [
      {
        feedItemId: 'feed-post-1',
        sourceItemId: 'source-post-1',
        sourceBindingId: 'source-binding-1',
        providerKey: 'reddit',
        title: 'Root post',
        observedAt: new Date('2026-06-05T12:01:00.000Z'),
        conversationContext: {
          rankingBasis: 'cohort_baseline_v1',
          bundleScore: 88,
          units: [
            {
              conversationUnitId: 'conversation-reply',
              providerUnitId: 't1_reply',
              parentProviderUnitId: 't1_parent',
              threadExternalId: 't3_post_1',
              canonicalUrl: 'https://reddit.test/comment/reply',
              body: 'High-score reply.',
              score: 88,
              providerScore: 120,
              replyCount: 4,
              signalBand: 'breakout',
              depth: 1,
              role: 'reply',
              selectionReason: 'ranked',
              publishedAt: '2026-06-05T12:02:00.000Z',
              ancestry: [
                {
                  conversationUnitId: 'conversation-parent',
                  providerUnitId: 't1_parent',
                  threadExternalId: 't3_post_1',
                  canonicalUrl: 'https://reddit.test/comment/parent',
                  body: 'Parent context.',
                  score: 25,
                  providerScore: 3,
                  replyCount: 1,
                  signalBand: 'normal',
                  depth: 0,
                  role: 'top_level_comment',
                  selectionReason: 'ancestor_context',
                  publishedAt: '2026-06-05T12:01:00.000Z',
                },
              ],
            },
          ],
        },
      },
    ],
  },
  policy: defaultSummaryGenerationPolicy(),
  requestedAt: new Date('2026-06-05T12:10:00.000Z'),
});
