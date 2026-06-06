import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { FeedRestModule } from '@social-monitor/feed/interfaces/rest/feed-rest.module';
import { IngestionRestModule } from '@social-monitor/ingestion/interfaces/rest/ingestion-rest.module';
import { MonitoringRestModule } from '@social-monitor/monitoring/interfaces/rest/monitoring-rest.module';
import { SummaryRestModule } from '@social-monitor/summary/interfaces/rest/summary-rest.module';

import { DomainErrorFilter } from './domain-error.filter';
import { HealthController } from './health.controller';
import { RequestContextMiddleware } from './request-context.middleware';

@Module({
  imports: [MonitoringRestModule, FeedRestModule, IngestionRestModule, SummaryRestModule],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: DomainErrorFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
