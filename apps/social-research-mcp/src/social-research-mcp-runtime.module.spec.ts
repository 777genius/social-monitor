import { Test } from '@nestjs/testing';
import { CircuitBreakerSourceFetcherAdapter } from '@social-monitor/ingestion/adapters/source/circuit-breaker-source-fetcher.adapter';
import { SocialResearchToolHandlers } from '@social-monitor/social-research/tools';

import { SocialResearchMcpRuntimeModule } from './social-research-mcp-runtime.module';

describe('SocialResearchMcpRuntimeModule', () => {
  it('builds MCP handlers backed by the ingestion source fetcher without worker loops', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [SocialResearchMcpRuntimeModule],
    }).compile();

    try {
      expect(moduleRef.get(SocialResearchToolHandlers)).toBeInstanceOf(
        SocialResearchToolHandlers,
      );
      expect(moduleRef.get(CircuitBreakerSourceFetcherAdapter)).toBeInstanceOf(
        CircuitBreakerSourceFetcherAdapter,
      );
    } finally {
      await moduleRef.close();
    }
  });
});
