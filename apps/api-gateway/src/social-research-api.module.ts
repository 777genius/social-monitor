import { Module } from '@nestjs/common';
import { SocialResearchRestModule } from '@social-monitor/social-research/rest';

import { SocialResearchRuntimeModule } from '../../social-research-runtime/src/social-research-runtime.module';

@Module({
  imports: [
    SocialResearchRestModule.register({
      imports: [SocialResearchRuntimeModule],
    }),
  ],
})
export class SocialResearchApiModule {}
