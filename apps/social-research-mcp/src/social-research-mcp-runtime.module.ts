import { Module } from '@nestjs/common';

import { SocialResearchRuntimeModule } from '../../social-research-runtime/src/social-research-runtime.module';

@Module({
  imports: [SocialResearchRuntimeModule],
  exports: [SocialResearchRuntimeModule],
})
export class SocialResearchMcpRuntimeModule {}
