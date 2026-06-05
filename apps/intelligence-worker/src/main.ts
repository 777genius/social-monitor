import { NestFactory } from '@nestjs/core';
import 'reflect-metadata';

import { IntelligenceWorkerModule } from './intelligence-worker.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(IntelligenceWorkerModule);
  app.enableShutdownHooks();
}

void bootstrap();
