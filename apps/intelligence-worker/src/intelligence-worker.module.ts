import { Module } from '@nestjs/common';

import { WorkerRuntimeModule } from '@social-monitor/platform-worker';

@Module({
  imports: [WorkerRuntimeModule.register({ serviceName: 'intelligence-worker' })],
})
export class IntelligenceWorkerModule {}
