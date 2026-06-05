import { Module } from '@nestjs/common';

import { WorkerRuntimeModule } from '@social-monitor/platform-worker';

@Module({
  imports: [WorkerRuntimeModule.register({ serviceName: 'delivery-service' })],
})
export class DeliveryServiceModule {}
