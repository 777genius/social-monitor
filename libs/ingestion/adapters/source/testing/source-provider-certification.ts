import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type {
  ProviderFailureKind,
  SourceProviderPort,
  SourceProviderScanContext,
  SourceQuery,
  SourceQueryMode,
} from '../../../ports';

export type SourceProviderCertificationConfig = {
  readonly providerFactory: () => SourceProviderPort;
  readonly validQuery: SourceQuery;
  readonly unsupportedQueryMode: SourceQueryMode;
  readonly expectedProviderKey: string;
  readonly expectedFailureKind?: ProviderFailureKind;
};

export const certifySourceProvider = (config: SourceProviderCertificationConfig): void => {
  describe(`${config.expectedProviderKey} source provider certification`, () => {
    it('declares a complete capability profile', () => {
      const provider = config.providerFactory();
      const profile = provider.capabilityProfile();

      expect(provider.key()).toBe(config.expectedProviderKey);
      expect(profile.providerKey).toBe(config.expectedProviderKey);
      expect(profile.displayName.trim()).not.toHaveLength(0);
      expect(profile.version).toBeGreaterThanOrEqual(1);
      expect(profile.supportedContentUnits.length).toBeGreaterThan(0);
      expect(profile.supportedQueryModes.length).toBeGreaterThan(0);
      expect(profile.cursorModel).toEqual(expect.any(String));
      expect(profile.stableIdentity.length).toBeGreaterThan(0);
      expect(profile.quotaModel).toEqual(expect.any(String));
      expect(profile.limitations.length).toBeGreaterThan(0);
    });

    it('rejects unsupported query modes before scanning', () => {
      const provider = config.providerFactory();

      expect(provider.validateBinding({
        ...config.validQuery,
        mode: config.unsupportedQueryMode,
      })).toEqual(expect.objectContaining({ ok: false }));
    });

    it('returns normalized items with stable identity fields', async () => {
      const provider = config.providerFactory();
      const context = makeContext();
      const validation = provider.validateBinding(config.validQuery);

      expect(validation).toEqual({ ok: true });

      const plan = provider.planScan(config.validQuery, context);
      const result = await provider.scan(plan, context);

      expect(plan.maxItems).toBeGreaterThan(0);
      expect(result.warnings).toEqual(expect.any(Array));

      for (const item of result.items) {
        expect(item.externalId.trim()).not.toHaveLength(0);
        expect(item.canonicalUrl.trim()).not.toHaveLength(0);
        expect(item.title.trim().length + item.body.trim().length).toBeGreaterThan(0);
        expect(item.publishedAt).toBeInstanceOf(Date);
      }
    });

    it('classifies provider errors instead of leaking raw failures', () => {
      const provider = config.providerFactory();
      const failure = provider.classifyError(new Error('provider failure'), makeContext());

      expect(failure.kind).toBe(config.expectedFailureKind ?? 'unknown');
      expect(failure.message.trim()).not.toHaveLength(0);
      expect(typeof failure.retryable).toBe('boolean');
    });
  });
};

const makeContext = (): SourceProviderScanContext => ({
  tenantId: tenantId('tenant-certification'),
  workspaceId: workspaceId('workspace-certification'),
  sourceBindingId: 'source-binding-certification',
  scanJobId: 'scan-job-certification',
  correlationId: 'correlation-certification',
});
