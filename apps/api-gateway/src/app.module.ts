import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { MonitoringRestModule } from '@social-monitor/monitoring/interfaces/rest/monitoring-rest.module';

import { HealthController } from './health.controller';
import { RequestContextMiddleware } from './request-context.middleware';

@Module({
  imports: [MonitoringRestModule],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
