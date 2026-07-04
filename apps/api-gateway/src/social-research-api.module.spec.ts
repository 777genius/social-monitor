import { Test } from '@nestjs/testing';
import { SocialResearchController } from '@social-monitor/social-research/rest';
import { SocialResearchToolHandlers } from '@social-monitor/social-research/tools';

import { SocialResearchApiModule } from './social-research-api.module';

describe('SocialResearchApiModule', () => {
  it('wires REST social research routes to the shared SDK runtime handlers', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [SocialResearchApiModule],
    }).compile();

    try {
      expect(moduleRef.get(SocialResearchController)).toBeInstanceOf(
        SocialResearchController,
      );
      expect(moduleRef.get(SocialResearchToolHandlers)).toBeInstanceOf(
        SocialResearchToolHandlers,
      );
    } finally {
      await moduleRef.close();
    }
  });
});
