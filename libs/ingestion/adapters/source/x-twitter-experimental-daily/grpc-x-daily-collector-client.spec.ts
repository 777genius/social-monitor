import { status } from '@grpc/grpc-js';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import {
  XCollectedPost,
  XEligibilityMetricsState,
  XPostContentKind,
  XSearchProduct,
} from '@social-monitor/contracts/generated/grpc/x_collector/v1/x_collector';

import { GrpcXDailyCollectorClient } from './grpc-x-daily-collector-client';

describe('GrpcXDailyCollectorClient', () => {
  it('maps daily search requests and responses through the generated gRPC client', async () => {
    const calls: unknown[] = [];
    const serializedPost = XCollectedPost.decode(XCollectedPost.encode({
      tweetId: '123',
      canonicalUrl: 'https://x.com/a/status/123',
      text: 'hello',
      authorHandle: 'a',
      authorName: '',
      publishedAt: new Date('2026-06-27T00:00:00.000Z'),
      metrics: {
        likes: '15',
        retweets: '2',
        replies: '3',
        quotes: '0',
        views: '1000',
        quotesObserved: false,
        viewsObserved: true,
        likesObserved: true,
        retweetsObserved: true,
        eligibilityState: XEligibilityMetricsState.X_ELIGIBILITY_METRICS_STATE_OBSERVED,
      },
      mediaUrls: [],
      sourceProduct: XSearchProduct.X_SEARCH_PRODUCT_TOP,
      trendScore: 24,
      contentKind: XPostContentKind.X_POST_CONTENT_KIND_ORIGINAL,
    }).finish());
    const grpcClient = {
      collectDailySearch: (
        request: unknown,
        metadata: { get(key: string): unknown[] },
        options: { deadline?: Date },
        callback: (error: Error | null, response: unknown) => void,
      ) => {
        calls.push({
          request,
          correlationId: metadata.get('x-correlation-id'),
          authorization: metadata.get('authorization'),
          deadline: options.deadline?.toISOString(),
        });
        callback(null, {
          schemaVersion: 1,
          posts: [serializedPost],
          nextCursor: 'cursor-1',
          warnings: [{ code: 'partial_raw_metrics', message: 'quotes missing' }],
          run: {
            collectorEngine: 'scweet',
            collectorVersion: '5.3',
            startedAt: new Date('2026-06-27T00:00:00.000Z'),
            completedAt: new Date('2026-06-27T00:00:01.000Z'),
            requestedLimit: 20,
            fetchedCount: 10,
            returnedCount: 1,
            partial: false,
          },
        });
      },
    };

    const client = new GrpcXDailyCollectorClient(
      grpcClient as never,
      { now: () => new Date('2026-06-27T00:00:00.000Z') },
      { timeoutMs: 1_000, serviceToken: 'token-value' },
    );

    await expect(client.collectDailySearch({
      requestId: 'req-1',
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1',
      scanJobId: 'scan-1',
      correlationId: 'corr-1',
      query: 'ai agents',
      language: 'en',
      windowHours: 24,
      windowEnd: new Date('2026-06-27T00:00:00.000Z'),
      searchProducts: ['top', 'latest'],
      limitPerProduct: 10,
      maxItems: 20,
      minLikes: 5,
    })).resolves.toMatchObject({
      nextCursor: 'cursor-1',
      posts: [{
        tweetId: '123',
        metrics: {
          likes: 15,
          retweets: 2,
          replies: 3,
          quotes: undefined,
          views: 1000,
          eligibilityState: 'observed',
        },
        contentKind: 'original_post',
        sourceProduct: 'top',
      }],
      warnings: [{ code: 'partial_raw_metrics' }],
      run: {
        collectorEngine: 'scweet',
        collectorVersion: '5.3',
      },
    });

    expect(calls).toEqual([{
      request: expect.objectContaining({
        schemaVersion: 1,
        query: 'ai agents',
        searchProducts: [1, 2],
        minLikes: 5,
      }),
      correlationId: ['corr-1'],
      authorization: ['Bearer token-value'],
      deadline: '2026-06-27T00:00:01.000Z',
    }]);
  });

  it('propagates gRPC failures for the provider classifier', async () => {
    const grpcClient = {
      collectDailySearch: (
        _request: unknown,
        _metadata: unknown,
        _options: unknown,
        callback: (error: Error & { code?: number }, response?: unknown) => void,
      ) => {
        const error = new Error('rate limited') as Error & { code?: number };
        error.code = status.RESOURCE_EXHAUSTED;
        callback(error);
      },
    };
    const client = new GrpcXDailyCollectorClient(
      grpcClient as never,
      { now: () => new Date('2026-06-27T00:00:00.000Z') },
      { timeoutMs: 1_000 },
    );

    await expect(client.collectDailySearch({
      requestId: 'req-1',
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1',
      scanJobId: 'scan-1',
      correlationId: 'corr-1',
      query: 'ai agents',
      windowHours: 24,
      windowEnd: new Date('2026-06-27T00:00:00.000Z'),
      searchProducts: ['top'],
      limitPerProduct: 10,
      maxItems: 10,
    })).rejects.toMatchObject({
      code: status.RESOURCE_EXHAUSTED,
    });
  });
});
