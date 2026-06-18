import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { DeliveryRestModule } from '@social-monitor/delivery/interfaces/rest/delivery-rest.module';
import { FeedRestModule } from '@social-monitor/feed/interfaces/rest/feed-rest.module';
import { IdentityRestModule } from '@social-monitor/identity/interfaces/rest/identity-rest.module';
import { sourceReadinessProfiles } from '@social-monitor/ingestion/adapters/source/source-readiness-profiles';
import { IngestionRestModule } from '@social-monitor/ingestion/interfaces/rest/ingestion-rest.module';
import { LaunchRestModule } from '@social-monitor/launch/interfaces/rest/launch-rest.module';
import { MonitoringRestModule } from '@social-monitor/monitoring/interfaces/rest/monitoring-rest.module';
import { SystemClock } from '@social-monitor/shared-kernel';
import { SummaryRestModule } from '@social-monitor/summary/interfaces/rest/summary-rest.module';

import { DomainErrorFilter } from './domain-error.filter';
import { HealthController } from './health.controller';
import {
  API_GATEWAY_HEALTH_CLOCK,
  API_GATEWAY_HEALTH_ENV,
  API_GATEWAY_SOURCE_READINESS_PROFILES,
  API_GATEWAY_UPTIME_SECONDS,
  ApiGatewayHealthReporter,
} from './health-reporter';
import { RequestContextMiddleware } from './request-context.middleware';

@Module({
  imports: [
    MonitoringRestModule,
    FeedRestModule,
    IngestionRestModule,
    LaunchRestModule,
    SummaryRestModule,
    DeliveryRestModule,
    IdentityRestModule,
  ],
  controllers: [HealthController],
  providers: [
    ApiGatewayHealthReporter,
    {
      provide: API_GATEWAY_HEALTH_ENV,
      useFactory: (): NodeJS.ProcessEnv => process.env,
    },
    {
      provide: API_GATEWAY_HEALTH_CLOCK,
      useFactory: () => new SystemClock(),
    },
    {
      provide: API_GATEWAY_UPTIME_SECONDS,
      useFactory: (): (() => number) => () => process.uptime(),
    },
    {
      provide: API_GATEWAY_SOURCE_READINESS_PROFILES,
      useValue: sourceReadinessProfiles,
    },
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
