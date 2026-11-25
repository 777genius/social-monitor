import { redactSensitiveText } from '@social-monitor/shared-kernel';

import type {
  ProviderFailure,
  SourceCapabilityProfile,
  SourceProviderPort,
  SourceProviderScanContext,
  SourceProviderScanPlan,
  SourceProviderScanResult,
  SourceProviderValidationResult,
  SourceQuery,
} from '../../ports';

const capabilityProfile: SourceCapabilityProfile = {
  providerKey: 'fake-source',
  displayName: 'Fake Source',
  version: 1,
  productionSafe: true,
  supportedContentUnits: ['post', 'link'],
  supportedQueryModes: ['search', 'listing'],
  cursorModel: 'opaque',
  stableIdentity: ['externalId', 'canonicalUrl'],
  quotaModel: 'none',
  limitations: ['Deterministic local MVP provider; not a real social source.'],
};

export class FakeSourceProvider implements SourceProviderPort {
  key(): string {
    return capabilityProfile.providerKey;
  }

  capabilityProfile(): SourceCapabilityProfile {
    return capabilityProfile;
  }

  validateBinding(query: SourceQuery): SourceProviderValidationResult {
    if (!capabilityProfile.supportedQueryModes.includes(query.mode)) {
      return { ok: false, reason: `Unsupported query mode: ${query.mode}` };
    }

    if (query.query.trim().length === 0) {
      return { ok: false, reason: 'Query must be non-empty' };
    }

    return { ok: true };
  }

  planScan(query: SourceQuery, context: SourceProviderScanContext): SourceProviderScanPlan {
    void context;

    return {
      query,
      maxItems: 2,
      cursor: 'fake-cursor-start',
    };
  }

  async scan(plan: SourceProviderScanPlan, context: SourceProviderScanContext): Promise<SourceProviderScanResult> {
    const publishedAt = new Date('2026-01-01T00:00:00.000Z');

    return {
      items: [
        {
          externalId: `${context.sourceBindingId}:fake-post-1`,
          canonicalUrl: `https://example.test/source/${context.sourceBindingId}/fake-post-1`,
          title: 'Fake source post 1',
          body: `First deterministic item for ${plan.query.query}`,
          authorHandle: 'fake-author',
          publishedAt,
        },
        {
          externalId: `${context.sourceBindingId}:fake-post-2`,
          canonicalUrl: `https://example.test/source/${context.sourceBindingId}/fake-post-2`,
          title: 'Fake source post 2',
          body: `Second deterministic item for ${plan.query.query}`,
          authorHandle: 'fake-author',
          publishedAt,
        },
      ],
      nextCursor: 'fake-cursor-next',
      warnings: [],
    };
  }

  classifyError(error: unknown): ProviderFailure {
    const rawMessage = error instanceof Error ? error.message : 'Unknown provider error';

    return {
      kind: 'unknown',
      retryable: false,
      message: redactSensitiveText(rawMessage),
    };
  }
}
