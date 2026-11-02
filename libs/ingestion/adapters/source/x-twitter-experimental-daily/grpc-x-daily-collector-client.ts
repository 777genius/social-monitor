import { credentials, type ChannelCredentials } from '@grpc/grpc-js';
import { validatedXQuotedPost } from './x-quoted-post';
import type { XPostLookupRequest } from './x-daily-collector-client.port';
import {
  createGrpcDeadline,
  createGrpcRequestMetadata,
} from '@social-monitor/platform-grpc';
import type { Clock } from '@social-monitor/shared-kernel';
import {
  type CollectDailySearchRequest,
  type CollectDailySearchResponse,
  XCollectorServiceClient,
  XEligibilityMetricsState,
  XPostContentKind,
  XSearchProduct,
} from '@social-monitor/contracts/generated/grpc/x_collector/v1/x_collector';

import type {
  XDailyCollectedPost,
  XDailyCollectorClientPort,
  XDailyCollectorRequest,
  XDailyCollectorResult,
  XDailyCollectorRun,
  XDailyPostMetrics,
  XDailySearchProduct,
} from './x-daily-collector-client.port';

export type GrpcXDailyCollectorClientOptions = {
  readonly timeoutMs: number;
  readonly serviceToken?: string;
};

const schemaVersion = 1;

export class GrpcXDailyCollectorClient implements XDailyCollectorClientPort {
  static connect(params: {
    readonly address: string;
    readonly clock: Clock;
    readonly options: GrpcXDailyCollectorClientOptions;
    readonly credentials?: ChannelCredentials;
  }): GrpcXDailyCollectorClient {
    return new GrpcXDailyCollectorClient(
      new XCollectorServiceClient(
        params.address,
        params.credentials ?? credentials.createInsecure(),
      ),
      params.clock,
      params.options,
    );
  }

  constructor(
    private readonly client: XCollectorServiceClient,
    private readonly clock: Clock,
    private readonly options: GrpcXDailyCollectorClientOptions,
  ) {
    if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1) {
      throw new Error('X collector gRPC timeout must be a positive integer');
    }
  }

  async collectDailySearch(
    request: XDailyCollectorRequest,
  ): Promise<XDailyCollectorResult> {
    const metadata = createGrpcRequestMetadata({
      correlationId: request.correlationId,
      serviceToken: this.options.serviceToken,
    });
    const deadline = createGrpcDeadline(this.clock, this.options.timeoutMs);
    const grpcRequest = toGrpcRequest(request);

    return new Promise((resolve, reject) => {
      this.client.collectDailySearch(
        grpcRequest,
        metadata,
        { deadline },
        (error, response) => {
          if (error !== null) {
            reject(error);
            return;
          }

          resolve(fromGrpcResponse(response));
        },
      );
    });
  }

  async lookupPosts(request: XPostLookupRequest): Promise<XDailyCollectorResult> {
    if (request.tweetIds.length < 1 || request.tweetIds.length > 50 ||
        new Set(request.tweetIds).size !== request.tweetIds.length ||
        request.tweetIds.some(id => !/^[1-9][0-9]{0,19}$/u.test(id))) {
      throw new Error('Post lookup requires 1-50 distinct numeric ids');
    }
    return new Promise((resolve, reject) => this.client.lookupPosts({
      schemaVersion, requestId: request.requestId, tenantId: request.tenantId,
      workspaceId: request.workspaceId, sourceBindingId: request.sourceBindingId,
      scanJobId: request.scanJobId, correlationId: request.correlationId,
      tweetIds: [...request.tweetIds],
    }, createGrpcRequestMetadata({ correlationId: request.correlationId,
      serviceToken: this.options.serviceToken }),
    { deadline: createGrpcDeadline(this.clock, this.options.timeoutMs) }, (error, response) => {
      if (error !== null) { reject(error); return; }
      const result = fromGrpcResponse(response);
      if (response.schemaVersion !== schemaVersion || result.posts.length > request.tweetIds.length ||
          new Set(result.posts.map(post => post.tweetId)).size !== result.posts.length ||
          result.posts.some(post => !request.tweetIds.includes(post.tweetId))) {
        reject(new Error('Post lookup returned an unrequested identity')); return;
      }
      resolve(result);
    }));
  }
}

const toGrpcRequest = (
  request: XDailyCollectorRequest,
): CollectDailySearchRequest => ({
  schemaVersion,
  requestId: request.requestId,
  tenantId: request.tenantId,
  workspaceId: request.workspaceId,
  sourceBindingId: request.sourceBindingId,
  scanJobId: request.scanJobId,
  correlationId: request.correlationId,
  query: request.query,
  language: request.language ?? '',
  windowHours: request.windowHours,
  windowEnd: request.windowEnd,
  searchProducts: request.searchProducts.map(toGrpcSearchProduct),
  limitPerProduct: request.limitPerProduct,
  maxItems: request.maxItems,
  minLikes: request.minLikes ?? 0,
  minRetweets: request.minRetweets ?? 0,
  minReplies: request.minReplies ?? 0,
  cursor: request.cursor ?? '',
});

const fromGrpcResponse = (
  response: CollectDailySearchResponse,
): XDailyCollectorResult => ({
  posts: response.posts.flatMap(fromGrpcPost),
  nextCursor: optionalString(response.nextCursor),
  warnings: response.warnings.map((warning) => ({
    code: warning.code,
    message: warning.message,
  })),
  run: response.run === undefined ? undefined : fromGrpcRun(response.run),
});

const fromGrpcPost = (
  post: CollectDailySearchResponse['posts'][number],
): readonly XDailyCollectedPost[] => {
  const publishedAt = post.publishedAt;
  const metrics = post.metrics;
  const sourceProduct = fromGrpcSearchProduct(post.sourceProduct);

  if (
    post.tweetId.trim().length === 0 ||
    post.canonicalUrl.trim().length === 0 ||
    post.text.trim().length === 0 ||
    publishedAt === undefined ||
    metrics === undefined ||
    sourceProduct === undefined
  ) {
    return [];
  }

  return [{
    tweetId: post.tweetId,
    canonicalUrl: post.canonicalUrl,
    text: post.text,
    authorHandle: optionalString(post.authorHandle),
    authorName: optionalString(post.authorName),
    publishedAt,
    metrics: fromGrpcMetrics(metrics),
    mediaUrls: post.mediaUrls,
    sourceProduct,
    trendScore: Number.isFinite(post.trendScore) ? post.trendScore : 0,
    contentKind: fromGrpcContentKind(post.contentKind),
    ...(fromGrpcContentKind(post.contentKind) !== 'quote' || post.quotedPost === undefined ||
        post.quotedPost.publishedAt === undefined ? {} : {
      quotedPost: validatedXQuotedPost({ tweetId: post.quotedPost.tweetId,
        canonicalUrl: post.quotedPost.canonicalUrl, text: post.quotedPost.text,
        authorHandle: post.quotedPost.authorHandle, publishedAt: post.quotedPost.publishedAt },
      post.tweetId, publishedAt),
    }),
  }];
};

const fromGrpcMetrics = (
  metrics: NonNullable<CollectDailySearchResponse['posts'][number]['metrics']>,
): XDailyPostMetrics => ({
  likes: metrics.likesObserved ? readUnsignedInteger(metrics.likes) : undefined,
  retweets: metrics.retweetsObserved
    ? readUnsignedInteger(metrics.retweets)
    : undefined,
  replies: readUnsignedInteger(metrics.replies) ?? 0,
  quotes: metrics.quotesObserved
    ? readUnsignedInteger(metrics.quotes)
    : undefined,
  views: metrics.viewsObserved
    ? readUnsignedInteger(metrics.views)
    : undefined,
  eligibilityState: fromGrpcEligibilityState(metrics.eligibilityState),
});

const fromGrpcEligibilityState = (
  value: XEligibilityMetricsState,
): XDailyPostMetrics["eligibilityState"] => {
  switch (value) {
    case XEligibilityMetricsState.X_ELIGIBILITY_METRICS_STATE_OBSERVED:
      return "observed";
    case XEligibilityMetricsState.X_ELIGIBILITY_METRICS_STATE_MISSING:
      return "missing";
    case XEligibilityMetricsState.X_ELIGIBILITY_METRICS_STATE_MALFORMED:
      return "malformed";
    case XEligibilityMetricsState.X_ELIGIBILITY_METRICS_STATE_CONFLICT:
      return "conflict";
    case XEligibilityMetricsState.X_ELIGIBILITY_METRICS_STATE_UNSPECIFIED:
    case XEligibilityMetricsState.UNRECOGNIZED:
      return undefined;
  }
};

const fromGrpcRun = (
  run: NonNullable<CollectDailySearchResponse['run']>,
): XDailyCollectorRun => ({
  collectorEngine: run.collectorEngine,
  collectorVersion: run.collectorVersion,
  startedAt: run.startedAt,
  completedAt: run.completedAt,
  requestedLimit: run.requestedLimit,
  fetchedCount: run.fetchedCount,
  returnedCount: run.returnedCount,
  partial: run.partial,
});

const toGrpcSearchProduct = (
  product: XDailySearchProduct,
): XSearchProduct => {
  switch (product) {
    case 'top':
      return XSearchProduct.X_SEARCH_PRODUCT_TOP;
    case 'latest':
      return XSearchProduct.X_SEARCH_PRODUCT_LATEST;
  }
};

const fromGrpcSearchProduct = (
  product: XSearchProduct,
): XDailyCollectedPost['sourceProduct'] | undefined => {
  switch (product) {
    case XSearchProduct.X_SEARCH_PRODUCT_TOP:
      return 'top';
    case XSearchProduct.X_SEARCH_PRODUCT_LATEST:
      return 'latest';
    case XSearchProduct.X_SEARCH_PRODUCT_ID_LOOKUP:
      return 'id_lookup';
    case XSearchProduct.X_SEARCH_PRODUCT_UNSPECIFIED:
    case XSearchProduct.UNRECOGNIZED:
      return undefined;
  }
};

const fromGrpcContentKind = (
  value: XPostContentKind,
): XDailyCollectedPost["contentKind"] => {
  switch (value) {
    case XPostContentKind.X_POST_CONTENT_KIND_ORIGINAL:
      return "original_post";
    case XPostContentKind.X_POST_CONTENT_KIND_REPLY:
      return "reply";
    case XPostContentKind.X_POST_CONTENT_KIND_QUOTE:
      return "quote";
    case XPostContentKind.X_POST_CONTENT_KIND_UNSPECIFIED:
    case XPostContentKind.UNRECOGNIZED:
      return undefined;
  }
};

const optionalString = (value: string): string | undefined => {
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
};

const readUnsignedInteger = (value: string): number | undefined => {
  if (!/^\d+$/u.test(value)) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isSafeInteger(parsed) ? parsed : undefined;
};
