import { MonitoringSourceConfigReaderAdapter } from '../apps/ingestion-worker/src/adapters/source/monitoring-source-config-reader.adapter';
import { InMemorySourceProviderRegistry } from '../libs/ingestion/adapters/source/in-memory-source-provider.registry';
import type {
  RedditClientPort,
  RedditListSubredditPostsRequest,
  RedditListingPage,
} from '../libs/ingestion/adapters/source/reddit/reddit-client.port';
import { RedditSourceProvider } from '../libs/ingestion/adapters/source/reddit/reddit-source.provider';
import type {
  RedditRefreshTokenProviderPort,
  RedditRefreshTokenRequest,
} from '../libs/ingestion/adapters/source/reddit/refresh-token-reddit-token-provider';
import { RegistrySourceFetcherAdapter } from '../libs/ingestion/adapters/source/registry-source-fetcher.adapter';
import { InMemorySourceBindingRepository } from '../libs/monitoring/adapters/persistence/in-memory-source-binding.repository';
import { AesGcmSourceBindingConfigProtector } from '../libs/monitoring/adapters/security/aes-gcm-source-binding-config-protector';
import { SourceBinding } from '../libs/monitoring/domain';
import type {
  SourceBindingConfig,
  SourceCredentialResolverPort,
  SourceCredentialSecret,
} from '../libs/monitoring/ports';
import { DomainError, err, ok, tenantId, workspaceId } from '@social-monitor/shared-kernel';

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

async function main(): Promise<void> {
  const tenant = tenantId('tenant-reddit-credential-ref-smoke');
  const workspace = workspaceId('workspace-reddit-credential-ref-smoke');
  const sourceBindingId = 'source-binding-reddit-credential-ref-smoke';
  const sourceCredentialId = 'source-credential-reddit-refresh-smoke';
  const sourceBindings = new InMemorySourceBindingRepository();
  const protector = new AesGcmSourceBindingConfigProtector(
    Buffer.alloc(32, 2),
    'reddit-credential-ref-smoke-key',
  );
  const config = await protector.protect({
    credentialRef: { sourceCredentialId },
    subreddit: 'OpenAI',
    listing: 'top',
    topTime: 'day',
    maxItems: 2,
    minScore: 10,
    userAgent: 'social-monitor-reddit-credential-ref-smoke/0.1',
  });

  await sourceBindings.save(SourceBinding.create({
    id: sourceBindingId,
    tenantId: tenant,
    workspaceId: workspace,
    topicId: 'topic-reddit-credential-ref-smoke',
    providerKey: 'reddit',
    capabilityProfileVersion: 1,
    config,
    createdAt: new Date('2026-06-27T00:00:00.000Z'),
  }));

  const redditClient = new CapturingRedditClient();
  const refreshTokenProvider = new CapturingRefreshTokenProvider();
  const sourceCredentialResolver = new StaticSourceCredentialResolver({
    expectedTenantId: tenant,
    expectedWorkspaceId: workspace,
    expectedProviderKey: 'reddit',
    secretsById: {
      [sourceCredentialId]: {
        clientId: 'reddit-client-id',
        clientSecret: 'reddit-client-secret',
        refreshToken: 'reddit-refresh-token',
      },
    },
  });
  const fetcher = new RegistrySourceFetcherAdapter(
    new InMemorySourceProviderRegistry([
      new RedditSourceProvider(redditClient, undefined, refreshTokenProvider),
    ], []),
    new MonitoringSourceConfigReaderAdapter(sourceBindings, protector, sourceCredentialResolver),
  );

  const result = await fetcher.fetch({
    tenantId: tenant,
    workspaceId: workspace,
    sourceBindingId,
    scanJobId: 'scan-job-reddit-credential-ref-smoke',
    providerKey: 'reddit',
    sourceQuery: {
      mode: 'listing',
      query: 'OpenAI:top',
    },
    correlationId: 'reddit-credential-ref-smoke',
  });

  assert(result.items.length === 1, `expected one Reddit item, got ${result.items.length}`);
  assert(result.items[0]?.externalId === 'reddit:t3_redditcredentialref', 'Reddit item must be normalized');
  assert(result.items[0]?.canonicalUrl.startsWith('https://www.reddit.com/'), 'Reddit item must expose canonical URL');
  assert(result.nextCursor === 'after-reddit-credential-ref', 'Reddit cursor must be preserved');
  assert(refreshTokenProvider.requests.length === 1, 'Reddit refresh token provider must be called once');
  assert(refreshTokenProvider.requests[0]?.clientId === 'reddit-client-id', 'Reddit client id must come from source credential');
  assert(
    refreshTokenProvider.requests[0]?.clientSecret === 'reddit-client-secret',
    'Reddit client secret must come from source credential',
  );
  assert(
    refreshTokenProvider.requests[0]?.refreshToken === 'reddit-refresh-token',
    'Reddit refresh token must come from source credential',
  );
  assert(redditClient.listRequests.length === 1, 'Reddit listing API must be called once');
  assert(redditClient.listRequests[0]?.accessToken === 'resolved-reddit-access-token', 'Reddit scan must use refreshed access token');
  assert(redditClient.listRequests[0]?.subreddit === 'OpenAI', 'Reddit scan must preserve binding subreddit');
  assert(redditClient.listRequests[0]?.listing === 'top', 'Reddit scan must preserve binding listing');
  assert(redditClient.listRequests[0]?.topTime === 'day', 'Reddit scan must preserve binding top time');
  assert(redditClient.listRequests[0]?.limit === 2, 'Reddit scan must preserve maxItems');
  assert(sourceCredentialResolver.calls.length === 1, 'Source credential resolver must be called once');
  assertNoRawSecretInBinding(config, 'reddit-client-secret');
  assertNoRawSecretInBinding(config, 'reddit-refresh-token');

  console.log('Reddit credentialRef smoke OK');
}

class CapturingRedditClient implements RedditClientPort {
  readonly listRequests: RedditListSubredditPostsRequest[] = [];

  async listSubredditPosts(request: RedditListSubredditPostsRequest): Promise<RedditListingPage> {
    this.listRequests.push(request);

    return {
      after: 'after-reddit-credential-ref',
      posts: [
        {
          id: 'redditcredentialref',
          name: 't3_redditcredentialref',
          subreddit: 'OpenAI',
          title: 'OpenAI discussion with enough signal',
          selftext: 'Community thread fetched through a source credential refresh-token flow.',
          author: 'source-monitor',
          permalink: '/r/OpenAI/comments/redditcredentialref/openai_discussion/',
          createdUtc: 1_782_518_400,
          score: 120,
          numComments: 37,
          upvoteRatio: 0.91,
        },
      ],
    };
  }

  async searchPosts(): Promise<RedditListingPage> {
    throw new Error('Reddit credentialRef smoke must use listing scan');
  }
}

class CapturingRefreshTokenProvider implements RedditRefreshTokenProviderPort {
  readonly requests: RedditRefreshTokenRequest[] = [];

  async getAccessToken(request: RedditRefreshTokenRequest): Promise<string> {
    this.requests.push(request);

    return 'resolved-reddit-access-token';
  }
}

class StaticSourceCredentialResolver implements SourceCredentialResolverPort {
  readonly calls: Array<Parameters<SourceCredentialResolverPort['resolve']>[0]> = [];

  constructor(private readonly options: {
    readonly expectedTenantId: string;
    readonly expectedWorkspaceId: string;
    readonly expectedProviderKey: string;
    readonly secretsById: Readonly<Record<string, SourceCredentialSecret>>;
  }) {}

  async resolve(
    params: Parameters<SourceCredentialResolverPort['resolve']>[0],
  ): ReturnType<SourceCredentialResolverPort['resolve']> {
    this.calls.push(params);
    if (
      params.tenantId !== this.options.expectedTenantId
      || params.workspaceId !== this.options.expectedWorkspaceId
      || params.providerKey !== this.options.expectedProviderKey
    ) {
      return err(new DomainError('authorization.denied', 'Source credential scope mismatch'));
    }

    const secret = this.options.secretsById[params.sourceCredentialId];

    return secret === undefined
      ? err(new DomainError('resource.not_found', 'Source credential not found'))
      : ok(secret);
  }
}

const assertNoRawSecretInBinding = (config: SourceBindingConfig, secret: string): void => {
  const serialized = JSON.stringify(config);
  assert(!serialized.includes(secret), 'Protected source binding config must not contain raw source credential secret');
};

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
