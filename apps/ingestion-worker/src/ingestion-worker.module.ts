import { Module } from '@nestjs/common';

import { WorkerRuntimeModule } from '@social-monitor/platform-worker';

@Module({
  imports: [WorkerRuntimeModule.register({ serviceName: 'ingestion-worker' })],
})
export class IngestionWorkerModule {}
