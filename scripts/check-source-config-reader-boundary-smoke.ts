import { MonitoringSourceConfigReaderAdapter } from '../libs/ingestion/adapters/source/monitoring-source-config-reader.adapter';
import { InMemorySourceProviderRegistry } from '../libs/ingestion/adapters/source/in-memory-source-provider.registry';
import { RegistrySourceFetcherAdapter } from '../libs/ingestion/adapters/source/registry-source-fetcher.adapter';
import type {
  ProviderFailure,
  SourceCapabilityProfile,
  SourceProviderPort,
  SourceProviderScanContext,
  SourceProviderScanPlan,
  SourceProviderScanResult,
  SourceProviderValidationResult,
  SourceQuery,
} from '../libs/ingestion/ports';
import { InMemorySourceBindingRepository } from '../libs/monitoring/adapters/persistence/in-memory-source-binding.repository';
import { AesGcmSourceBindingConfigProtector } from '../libs/monitoring/adapters/security/aes-gcm-source-binding-config-protector';
import { SourceBinding } from '../libs/monitoring/domain';
import type { SourceCredentialResolverPort, SourceCredentialSecret } from '../libs/monitoring/ports';
import { DomainError, err, ok, tenantId, workspaceId } from '@social-monitor/shared-kernel';

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

class CredentialAssertingSourceProvider implements SourceProviderPort {
  key(): string {
    return 'credential-source';
  }

  capabilityProfile(): SourceCapabilityProfile {
    return {
      providerKey: 'credential-source',
      displayName: 'Credential Source',
      version: 1,
      productionSafe: true,
      supportedContentUnits: ['post'],
      supportedQueryModes: ['search'],
      cursorModel: 'opaque',
      stableIdentity: ['providerId'],
      quotaModel: 'per_credential',
      limitations: ['Smoke-only provider.'],
    };
  }

  validateBinding(query: SourceQuery): SourceProviderValidationResult {
    return query.query.trim().length === 0
      ? { ok: false, reason: 'Query must be non-empty' }
      : { ok: true };
  }

  planScan(query: SourceQuery): SourceProviderScanPlan {
    return {
      query,
      maxItems: 1,
    };
  }

  async scan(
    plan: SourceProviderScanPlan,
    context: SourceProviderScanContext,
  ): Promise<SourceProviderScanResult> {
    if (plan.query.query === 'credential check') {
      assert(context.config?.accessToken === 'raw-access-token', 'provider must receive decrypted access token');
    } else if (plan.query.query === 'credential ref check') {
      assert(context.config?.accessToken === undefined, 'credentialRef source binding must not inject stale access token');
      assert(context.config?.clientId === 'reddit-client-id', 'provider must receive resolved Reddit client id');
      assert(context.config?.clientSecret === 'reddit-client-secret', 'provider must receive resolved Reddit client secret');
      assert(context.config?.refreshToken === 'reddit-refresh-token', 'provider must receive resolved Reddit refresh token');
      assert(context.config?.subreddit === 'observability', 'provider must preserve non-secret binding config');
    } else {
      throw new Error(`Unexpected source query: ${plan.query.query}`);
    }

    return {
      items: [
        {
          externalId: 'credential-source:1',
          canonicalUrl: 'https://example.test/credential-source/1',
          title: 'Credential source item',
          body: 'Fetched with runtime credential.',
          publishedAt: new Date('2026-06-06T00:00:00.000Z'),
        },
      ],
      warnings: [],
    };
  }

  classifyError(error: unknown): ProviderFailure {
    return {
      kind: 'unknown',
      retryable: false,
      message: error instanceof Error ? error.message : 'Unknown credential source error',
    };
  }
}

async function main(): Promise<void> {
  const tenant = tenantId('tenant-source-config-reader-smoke');
  const workspace = workspaceId('workspace-source-config-reader-smoke');
  const sourceBindings = new InMemorySourceBindingRepository();
  const protector = new AesGcmSourceBindingConfigProtector(Buffer.alloc(32, 1), 'source-config-reader-smoke-key');
  const protectedConfig = await protector.protect({
    query: 'credential check',
    accessToken: 'raw-access-token',
  });
  const protectedCredentialRefConfig = await protector.protect({
    query: 'credential ref check',
    credentialRef: {
      sourceCredentialId: 'source-credential-reddit-refresh',
    },
    subreddit: 'observability',
  });

  await sourceBindings.save(SourceBinding.create({
    id: 'source-binding-source-config-reader-smoke',
    tenantId: tenant,
    workspaceId: workspace,
    interestId: 'topic-source-config-reader-smoke',
    providerKey: 'credential-source',
    capabilityProfileVersion: 1,
    config: protectedConfig,
    createdAt: new Date('2026-06-06T00:00:00.000Z'),
  }));
  await sourceBindings.save(SourceBinding.create({
    id: 'source-binding-source-config-reader-credential-ref-smoke',
    tenantId: tenant,
    workspaceId: workspace,
    interestId: 'topic-source-config-reader-smoke',
    providerKey: 'credential-source',
    capabilityProfileVersion: 1,
    config: protectedCredentialRefConfig,
    createdAt: new Date('2026-06-06T00:00:00.000Z'),
  }));

  const fetcher = new RegistrySourceFetcherAdapter(
    new InMemorySourceProviderRegistry([new CredentialAssertingSourceProvider()], []),
    new MonitoringSourceConfigReaderAdapter(
      sourceBindings,
      protector,
      new StaticSourceCredentialResolver({
        'source-credential-reddit-refresh': {
          clientId: 'reddit-client-id',
          clientSecret: 'reddit-client-secret',
          refreshToken: 'reddit-refresh-token',
        },
      }),
    ),
  );
  const result = await fetcher.fetch({
    tenantId: tenant,
    workspaceId: workspace,
    sourceBindingId: 'source-binding-source-config-reader-smoke',
    scanJobId: 'scan-job-source-config-reader-smoke',
    providerKey: 'credential-source',
    sourceQuery: {
      mode: 'search',
      query: 'credential check',
    },
    correlationId: 'source-config-reader-smoke',
  });

  assert(result.items.length === 1, `expected one fetched item, got ${result.items.length}`);
  const credentialRefResult = await fetcher.fetch({
    tenantId: tenant,
    workspaceId: workspace,
    sourceBindingId: 'source-binding-source-config-reader-credential-ref-smoke',
    scanJobId: 'scan-job-source-config-reader-credential-ref-smoke',
    providerKey: 'credential-source',
    sourceQuery: {
      mode: 'search',
      query: 'credential ref check',
    },
    correlationId: 'source-config-reader-credential-ref-smoke',
  });

  assert(credentialRefResult.items.length === 1, `expected one credential-ref fetched item, got ${credentialRefResult.items.length}`);
  console.log('Source config reader boundary smoke OK');
}

class StaticSourceCredentialResolver implements SourceCredentialResolverPort {
  constructor(private readonly secretsById: Readonly<Record<string, SourceCredentialSecret>>) {}

  async resolve(
    params: Parameters<SourceCredentialResolverPort['resolve']>[0],
  ): ReturnType<SourceCredentialResolverPort['resolve']> {
    const secret = this.secretsById[params.sourceCredentialId];
    if (secret === undefined || params.providerKey !== 'credential-source') {
      return err(new DomainError('resource.not_found', 'Source credential not found'));
    }

    return ok(secret);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
