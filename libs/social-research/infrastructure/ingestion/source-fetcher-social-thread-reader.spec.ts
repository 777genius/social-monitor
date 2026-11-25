import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import type {
  FetchSourceItemsCommand,
  SourceFetcherPort,
} from '@social-monitor/ingestion/ports';

import {
  SourceFetcherSocialThreadReader,
} from './source-fetcher-social-thread-reader';
import type { SourceFetcherSocialThreadReaderError } from './source-fetcher-social-thread-reader';

describe('SourceFetcherSocialThreadReader', () => {
  it('fetches a source-bound thread through SourceFetcherPort', async () => {
    const calls: FetchSourceItemsCommand[] = [];
    const reader = new SourceFetcherSocialThreadReader({
      async fetch(command) {
        calls.push(command);

        return {
          items: [
            {
              externalId: 'reddit:t3_thread',
              canonicalUrl: 'https://www.reddit.com/r/test/comments/thread',
              title: 'Thread root',
              body: 'Root body',
              publishedAt: new Date('2026-07-04T00:00:00.000Z'),
            },
          ],
          conversationUnits: [
            {
              rootExternalId: 'reddit:t3_thread',
              rootProviderItemId: 't3_thread',
              providerUnitId: 't1_comment_1',
              canonicalUrl: 'https://www.reddit.com/r/test/comments/thread/_/c1',
              body: 'Top level comment',
              publishedAt: new Date('2026-07-04T01:00:00.000Z'),
              threadExternalId: 't3_thread',
              depth: 0,
              role: 'top_level_comment',
            },
            {
              rootExternalId: 'reddit:t3_thread',
              rootProviderItemId: 't3_thread',
              providerUnitId: 't1_reply_1',
              canonicalUrl: 'https://www.reddit.com/r/test/comments/thread/_/r1',
              body: 'Nested reply',
              publishedAt: new Date('2026-07-04T02:00:00.000Z'),
              threadExternalId: 't3_thread',
              parentProviderUnitId: 't1_comment_1',
              depth: 2,
              role: 'reply',
            },
          ],
        };
      },
    } satisfies SourceFetcherPort);

    const thread = await reader.fetchThread({
      sourceKey: 'reddit',
      externalId: 'reddit:t3_thread',
      maxDepth: 1,
      execution: executionScope(),
    });

    expect(calls).toEqual([
      expect.objectContaining({
        providerKey: 'reddit',
        sourceBindingId: 'binding-reddit',
        sourceQuery: {
          mode: 'search',
          query: 'reddit:t3_thread',
        },
      }),
    ]);
    expect(thread.root.itemId).toBe('reddit:t3_thread');
    expect(thread.units.map((unit) => unit.unitId)).toEqual(['t1_comment_1']);
  });

  it('requires a source binding for the selected source', async () => {
    const reader = new SourceFetcherSocialThreadReader({
      async fetch() {
        throw new Error('should not execute');
      },
    } satisfies SourceFetcherPort);

    await expect(
      reader.fetchThread({
        sourceKey: 'reddit',
        externalId: 'reddit:t3_thread',
        execution: {
          ...executionScope(),
          sourceBindingIdBySource: {},
        },
      }),
    ).rejects.toMatchObject({
      code: 'source_binding_missing',
    } satisfies Partial<SourceFetcherSocialThreadReaderError>);
  });
});

const executionScope = () => ({
  tenantId: tenantId('tenant-thread-reader-test'),
  workspaceId: workspaceId('workspace-thread-reader-test'),
  scanJobId: 'scan-thread-reader-test',
  sourceBindingIdBySource: {
    reddit: 'binding-reddit',
  },
});
