import { NestFactory } from '@nestjs/core';
import { bindPostgresRuntimeProcessIdentity } from '@social-monitor/platform-persistence';
import 'reflect-metadata';

import { DeliveryServiceModule } from './delivery-service.module';

async function bootstrap(): Promise<void> {
  bindPostgresRuntimeProcessIdentity(process.env, 'delivery-service');
  const app = await NestFactory.createApplicationContext(DeliveryServiceModule);
  app.enableShutdownHooks();
}

void bootstrap();
