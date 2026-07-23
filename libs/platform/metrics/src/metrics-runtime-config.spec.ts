import { resolveMetricsRuntimeConfig } from './metrics-runtime-config';

describe('resolveMetricsRuntimeConfig', () => {
  it('defaults beta runtimes to OTLP and resolves the standard signal path', () => {
    expect(
      resolveMetricsRuntimeConfig(
        {
          NODE_ENV: 'production',
          SOCIAL_MONITOR_RUNTIME_PROFILE: 'beta',
          OTEL_EXPORTER_OTLP_ENDPOINT: 'http://otel-collector:4318/',
        },
        'api-gateway',
      ),
    ).toMatchObject({
      serviceName: 'api-gateway',
      mode: 'otlp',
      runtimeProfile: 'beta',
      deploymentEnvironment: 'production',
      otlpMetricsEndpoint: 'http://otel-collector:4318/v1/metrics',
      exportIntervalMillis: 60_000,
      exportTimeoutMillis: 30_000,
      cardinalityLimit: 256,
    });
  });

  it('fails closed when beta attempts to use in-memory metrics', () => {
    expect(() =>
      resolveMetricsRuntimeConfig(
        {
          NODE_ENV: 'production',
          SOCIAL_MONITOR_RUNTIME_PROFILE: 'beta',
          SOCIAL_MONITOR_METRICS_MODE: 'in-memory',
        },
        'api-gateway',
      ),
    ).toThrow(
      'SOCIAL_MONITOR_METRICS_MODE=in-memory is not allowed when SOCIAL_MONITOR_RUNTIME_PROFILE=beta',
    );
  });

  it('requires a safe explicit endpoint for OTLP mode', () => {
    expect(() =>
      resolveMetricsRuntimeConfig(
        {
          NODE_ENV: 'test',
          SOCIAL_MONITOR_RUNTIME_PROFILE: 'deterministic-test',
          SOCIAL_MONITOR_METRICS_MODE: 'otlp',
        },
        'ingestion-worker',
      ),
    ).toThrow('OTEL_EXPORTER_OTLP_METRICS_ENDPOINT');

    expect(() =>
      resolveMetricsRuntimeConfig(
        {
          NODE_ENV: 'test',
          SOCIAL_MONITOR_RUNTIME_PROFILE: 'deterministic-test',
          SOCIAL_MONITOR_METRICS_MODE: 'otlp',
          OTEL_EXPORTER_OTLP_METRICS_ENDPOINT:
            'https://user:secret@example.test/v1/metrics',
        },
        'ingestion-worker',
      ),
    ).toThrow('must not contain credentials');
  });

  it('validates bounded export and cardinality settings', () => {
    expect(() =>
      resolveMetricsRuntimeConfig(
        {
          NODE_ENV: 'test',
          OTEL_METRIC_EXPORT_INTERVAL: '1000',
          OTEL_METRIC_EXPORT_TIMEOUT: '1000',
        },
        'delivery-service',
      ),
    ).toThrow('OTEL_METRIC_EXPORT_TIMEOUT must be lower');

    expect(() =>
      resolveMetricsRuntimeConfig(
        {
          NODE_ENV: 'test',
          SOCIAL_MONITOR_METRICS_CARDINALITY_LIMIT: '2001',
        },
        'delivery-service',
      ),
    ).toThrow('must be between 16 and 2000');
  });
});
