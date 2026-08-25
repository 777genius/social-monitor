import { credentials, type ChannelCredentials } from '@grpc/grpc-js';
import {
  createGrpcDeadline,
  createGrpcRequestMetadata,
} from '@social-monitor/platform-grpc';
import type { Clock } from '@social-monitor/shared-kernel';
import {
  type CollectDailySearchRequest,
  type CollectDailySearchResponse,
  XCollectorServiceClient,
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
  }];
};

const fromGrpcMetrics = (
  metrics: NonNullable<CollectDailySearchResponse['posts'][number]['metrics']>,
): XDailyPostMetrics => ({
  likes: readUnsignedInteger(metrics.likes),
  retweets: readUnsignedInteger(metrics.retweets),
  replies: readUnsignedInteger(metrics.replies),
  quotes: metrics.quotesObserved
    ? readUnsignedInteger(metrics.quotes)
    : undefined,
  views: metrics.viewsObserved
    ? readUnsignedInteger(metrics.views)
    : undefined,
});

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
): XDailySearchProduct | undefined => {
  switch (product) {
    case XSearchProduct.X_SEARCH_PRODUCT_TOP:
      return 'top';
    case XSearchProduct.X_SEARCH_PRODUCT_LATEST:
      return 'latest';
    case XSearchProduct.X_SEARCH_PRODUCT_UNSPECIFIED:
    case XSearchProduct.UNRECOGNIZED:
      return undefined;
  }
};

const optionalString = (value: string): string | undefined => {
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
};

const readUnsignedInteger = (value: string): number => {
  if (!/^\d+$/u.test(value)) {
    return 0;
  }

  const parsed = Number(value);

  return Number.isSafeInteger(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
};
