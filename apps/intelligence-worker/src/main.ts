import { NestFactory } from '@nestjs/core';
import { bindPostgresRuntimeProcessIdentity } from '@social-monitor/platform-persistence';
import 'reflect-metadata';

import { IntelligenceWorkerModule } from './intelligence-worker.module';

async function bootstrap(): Promise<void> {
  bindPostgresRuntimeProcessIdentity(process.env, 'intelligence-worker');
  const app = await NestFactory.createApplicationContext(IntelligenceWorkerModule);
  app.enableShutdownHooks();
}

void bootstrap();
