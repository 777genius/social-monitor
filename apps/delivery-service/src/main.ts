import { NestFactory } from '@nestjs/core';
import 'reflect-metadata';

import { DeliveryServiceModule } from './delivery-service.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(DeliveryServiceModule);
  app.enableShutdownHooks();
}

void bootstrap();
