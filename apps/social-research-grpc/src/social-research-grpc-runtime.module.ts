import { Module } from '@nestjs/common';
import { MetricsRuntimeModule } from '@social-monitor/platform-metrics/nest/metrics-runtime.module';

import { SocialResearchRuntimeModule } from '../../social-research-runtime/src/social-research-runtime.module';

@Module({
  imports: [
    MetricsRuntimeModule.register({ serviceName: 'social-research-grpc' }),
    SocialResearchRuntimeModule,
  ],
  exports: [SocialResearchRuntimeModule],
})
export class SocialResearchGrpcRuntimeModule {}
