import { NestFactory } from '@nestjs/core';
import { bindPostgresRuntimeProcessIdentity } from '@social-monitor/platform-persistence';
import 'reflect-metadata';

import { EventRelayModule } from './event-relay.module';

async function bootstrap(): Promise<void> {
  bindPostgresRuntimeProcessIdentity(process.env, 'event-relay');
  const app = await NestFactory.createApplicationContext(EventRelayModule);
  app.enableShutdownHooks();
}

void bootstrap();
