import { Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { SocialResearchToolHandlers } from '../tools/social-research-tool-handlers';
import { SocialResearchController } from './social-research.controller';
import { SocialResearchRestModule } from './social-research-rest.module';

@Module({
  providers: [
    {
      provide: SocialResearchToolHandlers,
      useFactory: () => new SocialResearchToolHandlers(),
    },
  ],
  exports: [SocialResearchToolHandlers],
})
class TestSocialResearchHandlersModule {}

describe('SocialResearchRestModule', () => {
  it('accepts handlers from an imported composition module', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        SocialResearchRestModule.register({
          imports: [TestSocialResearchHandlersModule],
        }),
      ],
    }).compile();

    try {
      expect(moduleRef.get(SocialResearchController)).toBeInstanceOf(
        SocialResearchController,
      );
    } finally {
      await moduleRef.close();
    }
  });

  it('keeps the explicit handler provider path for isolated composition roots', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        SocialResearchRestModule.register({
          handlersProvider: {
            provide: SocialResearchToolHandlers,
            useFactory: () => new SocialResearchToolHandlers(),
          },
        }),
      ],
    }).compile();

    try {
      expect(moduleRef.get(SocialResearchController)).toBeInstanceOf(
        SocialResearchController,
      );
    } finally {
      await moduleRef.close();
    }
  });

  it('rejects ambiguous runtime wiring', () => {
    expect(() => SocialResearchRestModule.register({})).toThrow(
      'SocialResearchRestModule requires either a handlersProvider',
    );
  });
});
