import { NestFactory } from '@nestjs/core';
import 'reflect-metadata';

import { IngestionWorkerModule } from './ingestion-worker.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(IngestionWorkerModule);
  app.enableShutdownHooks();
}

void bootstrap();
