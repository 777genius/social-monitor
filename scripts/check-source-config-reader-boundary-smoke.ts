import { MonitoringSourceConfigReaderAdapter } from '../apps/ingestion-worker/src/adapters/source/monitoring-source-config-reader.adapter';
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
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

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
    assert(plan.query.query === 'credential check', 'provider must receive source query');
    assert(context.config?.accessToken === 'raw-access-token', 'provider must receive decrypted access token');

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

  await sourceBindings.save(SourceBinding.create({
    id: 'source-binding-source-config-reader-smoke',
    tenantId: tenant,
    workspaceId: workspace,
    topicId: 'topic-source-config-reader-smoke',
    providerKey: 'credential-source',
    capabilityProfileVersion: 1,
    config: protectedConfig,
    createdAt: new Date('2026-06-06T00:00:00.000Z'),
  }));

  const fetcher = new RegistrySourceFetcherAdapter(
    new InMemorySourceProviderRegistry([new CredentialAssertingSourceProvider()], []),
    new MonitoringSourceConfigReaderAdapter(sourceBindings, protector),
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
  console.log('Source config reader boundary smoke OK');
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
