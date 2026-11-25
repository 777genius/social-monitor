import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { DeliveryRestModule } from '@social-monitor/delivery/interfaces/rest/delivery-rest.module';
import { FeedRestModule } from '@social-monitor/feed/interfaces/rest/feed-rest.module';
import { IdentityRestModule } from '@social-monitor/identity/interfaces/rest/identity-rest.module';
import { sourceReadinessProfilesForRuntime } from '@social-monitor/ingestion/adapters/source/source-readiness-profiles';
import { resolveSourceProviderRuntimeScope } from '@social-monitor/ingestion/adapters/source/source-provider-runtime-scope';
import { IngestionRestModule } from '@social-monitor/ingestion/interfaces/rest/ingestion-rest.module';
import { LaunchRestModule } from '@social-monitor/launch/interfaces/rest/launch-rest.module';
import { MonitoringRestModule } from '@social-monitor/monitoring/interfaces/rest/monitoring-rest.module';
import { MetricsRuntimeModule } from '@social-monitor/platform-metrics/nest/metrics-runtime.module';
import { probePostgresRuntimePoolConnectivity } from '@social-monitor/platform-persistence';
import { RelevanceRestModule } from '@social-monitor/relevance/interfaces/rest/relevance-rest.module';
import { SystemClock, type Clock } from '@social-monitor/shared-kernel';
import { SummaryRestModule } from '@social-monitor/summary/interfaces/rest/summary-rest.module';
import { SubscriptionsRestModule } from '@social-monitor/subscriptions/interfaces/rest/subscriptions-rest.module';

import { AppBootstrapController } from './app-bootstrap.controller';
import {
  APP_BOOTSTRAP_REFRESH_SCHEDULER,
  AppBootstrapCacheRefresher,
  nodeAppBootstrapRefreshScheduler,
} from './app-bootstrap-cache-refresher';
import {
  APP_BOOTSTRAP_PUBLIC_PRIME_CLIENT,
  APP_BOOTSTRAP_PUBLIC_PRIME_ENABLED,
  APP_BOOTSTRAP_PUBLIC_PRIME_SCHEDULER,
  AppBootstrapPublicPrimer,
  nodeAppBootstrapPublicPrimeClient,
  nodeAppBootstrapPublicPrimeScheduler,
} from './app-bootstrap-public-primer';
import {
  APP_BOOTSTRAP_READER_SUMMARY_CACHE_CLOCK,
  APP_BOOTSTRAP_READER_SUMMARY_CACHE_MAX_ENTRIES,
  APP_BOOTSTRAP_READER_SUMMARY_CACHE_STALE_MS,
  APP_BOOTSTRAP_READER_SUMMARY_CACHE_TTL_MS,
  AppBootstrapReaderSummaryCache,
} from './app-bootstrap-reader-summary-cache';
import { AppBootstrapReaderSummaryQuery } from './app-bootstrap-reader-summary-query';
import { DomainErrorFilter } from './domain-error.filter';
import { HealthController } from './health.controller';
import {
  API_GATEWAY_DATABASE_READINESS,
  API_GATEWAY_HEALTH_CLOCK,
  API_GATEWAY_HEALTH_ENV,
  API_GATEWAY_SOURCE_READINESS_PROFILES,
  API_GATEWAY_UPTIME_SECONDS,
  ApiGatewayHealthReporter,
  createApiGatewayDatabaseReadiness,
  type ApiGatewayDatabaseReadiness,
} from './health-reporter';
import { RequestContextMiddleware } from './request-context.middleware';
import { SocialResearchApiModule } from './social-research-api.module';

@Module({
  imports: [
    MetricsRuntimeModule.register({ serviceName: 'api-gateway' }),
    MonitoringRestModule,
    FeedRestModule,
    IngestionRestModule,
    LaunchRestModule,
    RelevanceRestModule,
    SubscriptionsRestModule,
    SummaryRestModule,
    DeliveryRestModule,
    IdentityRestModule,
    SocialResearchApiModule,
  ],
  controllers: [AppBootstrapController, HealthController],
  providers: [
    ApiGatewayHealthReporter,
    AppBootstrapReaderSummaryQuery,
    AppBootstrapCacheRefresher,
    AppBootstrapPublicPrimer,
    {
      provide: APP_BOOTSTRAP_PUBLIC_PRIME_ENABLED,
      useFactory: () => process.env.NODE_ENV === 'production',
    },
    {
      provide: APP_BOOTSTRAP_PUBLIC_PRIME_CLIENT,
      useValue: nodeAppBootstrapPublicPrimeClient,
    },
    {
      provide: APP_BOOTSTRAP_PUBLIC_PRIME_SCHEDULER,
      useValue: nodeAppBootstrapPublicPrimeScheduler,
    },
    {
      provide: APP_BOOTSTRAP_REFRESH_SCHEDULER,
      useValue: nodeAppBootstrapRefreshScheduler,
    },
    {
      provide: APP_BOOTSTRAP_READER_SUMMARY_CACHE_CLOCK,
      useFactory: () => new SystemClock(),
    },
    {
      provide: AppBootstrapReaderSummaryCache,
      inject: [APP_BOOTSTRAP_READER_SUMMARY_CACHE_CLOCK],
      useFactory: (clock: Clock) =>
        new AppBootstrapReaderSummaryCache(
          clock,
          APP_BOOTSTRAP_READER_SUMMARY_CACHE_TTL_MS,
          APP_BOOTSTRAP_READER_SUMMARY_CACHE_STALE_MS,
          APP_BOOTSTRAP_READER_SUMMARY_CACHE_MAX_ENTRIES,
        ),
    },
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
      useFactory: (): ReturnType<typeof sourceReadinessProfilesForRuntime> =>
        sourceReadinessProfilesForRuntime(
          resolveSourceProviderRuntimeScope(process.env),
        ),
    },
    {
      provide: API_GATEWAY_DATABASE_READINESS,
      useFactory: (): ApiGatewayDatabaseReadiness =>
        createApiGatewayDatabaseReadiness(
          process.env,
          probePostgresRuntimePoolConnectivity,
        ),
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
