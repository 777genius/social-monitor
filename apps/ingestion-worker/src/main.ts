import { NestFactory } from '@nestjs/core';
import { bindPostgresRuntimeProcessIdentity } from '@social-monitor/platform-persistence';
import 'reflect-metadata';

import { IngestionWorkerModule } from './ingestion-worker.module';

async function bootstrap(): Promise<void> {
  bindPostgresRuntimeProcessIdentity(process.env, 'ingestion-worker');
  const app = await NestFactory.createApplicationContext(IngestionWorkerModule);
  app.enableShutdownHooks();
}

void bootstrap();
