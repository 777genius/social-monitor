import type { SourceCapabilityProfile, SourceProviderRegistryPort, SourceReadinessProfile } from '../../ports';
import { ListSourceProfilesUseCase } from './list-source-profiles.use-case';

class FakeSourceProfileRegistry implements SourceProviderRegistryPort {
  async getProvider(): Promise<null> {
    return null;
  }

  async listCapabilityProfiles(): Promise<readonly SourceCapabilityProfile[]> {
    return [
      {
        providerKey: 'fake-source',
        displayName: 'Fake Source',
        version: 1,
        productionSafe: true,
        supportedContentUnits: ['post'],
        supportedQueryModes: ['search'],
        cursorModel: 'opaque',
        stableIdentity: ['externalId'],
        quotaModel: 'none',
        limitations: ['local only'],
      },
    ];
  }

  async getReadinessProfile(): Promise<null> {
    return null;
  }

  async listReadinessProfiles(): Promise<readonly SourceReadinessProfile[]> {
    return [
      {
        providerKey: 'fake-source',
        state: 'enabled_beta',
        acquisitionMode: 'deterministic_local_adapter',
        approvalOwner: 'engineering',
        termsNotes: 'local only',
        credentialOwnership: 'none',
        quotaModel: 'none',
        retentionNotes: 'synthetic',
        cursorModel: 'opaque',
        identityStrategy: ['externalId'],
        supportedContentUnits: ['post'],
        unsupportedContentUnits: [],
        estimatedCostPerScan: 'zero',
        betaEnablementCriteria: ['tests pass'],
        rollbackPlan: 'disable provider',
      },
      {
        providerKey: 'reddit',
        state: 'profiled',
        acquisitionMode: 'official_api_or_approved_vendor',
        approvalOwner: 'product_and_legal',
        termsNotes: 'readiness only',
        credentialOwnership: 'tenant_or_vendor',
        quotaModel: 'per_credential',
        retentionNotes: 'requires approval',
        cursorModel: 'opaque',
        identityStrategy: ['providerId'],
        supportedContentUnits: ['post'],
        unsupportedContentUnits: [],
        estimatedCostPerScan: 'unknown',
        betaEnablementCriteria: ['approval'],
        rollbackPlan: 'keep disabled',
      },
      {
        providerKey: 'x-twitter',
        state: 'provider_only',
        acquisitionMode: 'approved_paid_api_or_vendor',
        approvalOwner: 'product_and_legal',
        termsNotes: 'readiness only',
        credentialOwnership: 'vendor_or_tenant',
        quotaModel: 'per_credential',
        retentionNotes: 'contract-dependent',
        cursorModel: 'since_id',
        identityStrategy: ['providerId'],
        supportedContentUnits: ['post'],
        unsupportedContentUnits: [],
        estimatedCostPerScan: 'high_or_unknown',
        betaEnablementCriteria: ['approval'],
        rollbackPlan: 'keep disabled',
      },
    ];
  }
}

describe('ListSourceProfilesUseCase', () => {
  it('merges enabled provider capabilities with readiness-only future sources', async () => {
    const useCase = new ListSourceProfilesUseCase(new FakeSourceProfileRegistry());

    const result = await useCase.execute();

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          providerKey: 'fake-source',
          productionSafe: true,
          readinessState: 'enabled_beta',
          supportedQueryModes: expect.arrayContaining(['search']),
        }),
        expect.objectContaining({
          providerKey: 'reddit',
          productionSafe: false,
          readinessState: 'profiled',
          supportedQueryModes: [],
        }),
        expect.objectContaining({
          providerKey: 'x-twitter',
          readinessState: 'provider_only',
        }),
      ]),
    );
  });
});
