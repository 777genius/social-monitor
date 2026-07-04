import * as cacheEntryPoint from '@social-monitor/social-research/cache';
import * as contractsEntryPoint from '@social-monitor/social-research/contracts';
import * as coreEntryPoint from '@social-monitor/social-research';
import * as grpcEntryPoint from '@social-monitor/social-research/grpc';
import * as ingestionEntryPoint from '@social-monitor/social-research/ingestion';
import * as mcpEntryPoint from '@social-monitor/social-research/mcp';
import * as restEntryPoint from '@social-monitor/social-research/rest';
import * as toolsEntryPoint from '@social-monitor/social-research/tools';

describe('social-research public entrypoints', () => {
  it('keeps the root SDK barrel focused on domain and application APIs', () => {
    expect(coreEntryPoint).toHaveProperty('SocialResearchSdk');
    expect(coreEntryPoint).toHaveProperty('createSocialResearchRequestBuilder');
    expect(coreEntryPoint).toHaveProperty(
      'DefaultSocialResearchExecutionPolicy',
    );
    expect(coreEntryPoint).toHaveProperty('SocialResearchCacheKeyBuilder');
    expect(coreEntryPoint).toHaveProperty('rankSocialItems');
    expect(coreEntryPoint).toHaveProperty('planSocialSearch');
    expect(coreEntryPoint).toHaveProperty('compileSocialQueryStrategyRecipe');
    expect(coreEntryPoint).not.toHaveProperty('SocialResearchToolHandlers');
    expect(coreEntryPoint).not.toHaveProperty('registerSocialResearchMcpTools');
    expect(coreEntryPoint).not.toHaveProperty(
      'createSocialResearchGrpcService',
    );
    expect(coreEntryPoint).not.toHaveProperty(
      'EphemeralSocialResearchResultCache',
    );
    expect(coreEntryPoint).not.toHaveProperty(
      'SourceFetcherSocialResearchGateway',
    );
  });

  it('exposes adapter entrypoints explicitly for composition roots', () => {
    expect(toolsEntryPoint).toHaveProperty('SocialResearchToolHandlers');
    expect(toolsEntryPoint).toHaveProperty(
      'buildSocialResearchToolJsonSchemas',
    );
    expect(mcpEntryPoint).toHaveProperty('registerSocialResearchMcpTools');
    expect(grpcEntryPoint).toHaveProperty('createSocialResearchGrpcService');
    expect(restEntryPoint).toHaveProperty('SocialResearchRestModule');
    expect(restEntryPoint).toHaveProperty('SocialResearchController');
    expect(ingestionEntryPoint).toHaveProperty(
      'SourceFetcherSocialResearchGateway',
    );
    expect(ingestionEntryPoint).toHaveProperty(
      'SourceFetcherSocialThreadReader',
    );
    expect(ingestionEntryPoint).toHaveProperty(
      'socialSourceCapabilitiesFromRegistry',
    );
    expect(cacheEntryPoint).toHaveProperty(
      'EphemeralSocialResearchResultCache',
    );
    expect(cacheEntryPoint).toHaveProperty('PrismaSocialResearchResultCache');
    expect(contractsEntryPoint).toHaveProperty('buildSocialResearchContract');
  });
});
