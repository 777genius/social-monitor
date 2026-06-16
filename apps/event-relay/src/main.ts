import { NestFactory } from '@nestjs/core';
import 'reflect-metadata';

import { EventRelayModule } from './event-relay.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(EventRelayModule);
  app.enableShutdownHooks();
}

void bootstrap();
