import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';

import { HealthController } from './health.controller';
import { RequestContextMiddleware } from './request-context.middleware';

@Module({
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
