import {
  assertRuntimeProfileAllowsMode,
  resolveRuntimeProfile,
  type RuntimeProfile,
} from '@social-monitor/platform-config';

export type MetricsRuntimeMode = 'in-memory' | 'otlp';

export type MetricsRuntimeConfig = {
  readonly serviceName: string;
  readonly mode: MetricsRuntimeMode;
  readonly runtimeProfile: RuntimeProfile;
  readonly deploymentEnvironment: 'development' | 'test' | 'production';
  readonly otlpMetricsEndpoint: string | undefined;
  readonly exportIntervalMillis: number;
  readonly exportTimeoutMillis: number;
  readonly cardinalityLimit: number;
};

const serviceNamePattern = /^[a-z][a-z0-9-]{0,62}$/;
const metricsModes: readonly MetricsRuntimeMode[] = ['in-memory', 'otlp'];

export const resolveMetricsRuntimeConfig = (
  env: NodeJS.ProcessEnv,
  serviceName: string,
): MetricsRuntimeConfig => {
  if (!serviceNamePattern.test(serviceName)) {
    throw new Error(`Invalid OpenTelemetry service name "${serviceName}"`);
  }

  const runtimeProfile = resolveRuntimeProfile(env);
  const mode = resolveMetricsMode(env, runtimeProfile);
  assertRuntimeProfileAllowsMode({
    env,
    settingName: 'SOCIAL_MONITOR_METRICS_MODE',
    selectedMode: mode,
    durableModes: ['otlp'],
  });

  const otlpMetricsEndpoint =
    mode === 'otlp' ? resolveOtlpMetricsEndpoint(env) : undefined;
  const exportIntervalMillis = parseBoundedInteger(
    env.OTEL_METRIC_EXPORT_INTERVAL,
    'OTEL_METRIC_EXPORT_INTERVAL',
    60_000,
    1_000,
    300_000,
  );
  const exportTimeoutMillis = parseBoundedInteger(
    env.OTEL_METRIC_EXPORT_TIMEOUT,
    'OTEL_METRIC_EXPORT_TIMEOUT',
    30_000,
    500,
    120_000,
  );
  if (exportTimeoutMillis >= exportIntervalMillis) {
    throw new Error(
      'OTEL_METRIC_EXPORT_TIMEOUT must be lower than OTEL_METRIC_EXPORT_INTERVAL',
    );
  }

  return {
    serviceName,
    mode,
    runtimeProfile,
    deploymentEnvironment: deploymentEnvironmentFor(runtimeProfile),
    otlpMetricsEndpoint,
    exportIntervalMillis,
    exportTimeoutMillis,
    cardinalityLimit: parseBoundedInteger(
      env.SOCIAL_MONITOR_METRICS_CARDINALITY_LIMIT,
      'SOCIAL_MONITOR_METRICS_CARDINALITY_LIMIT',
      256,
      16,
      2_000,
    ),
  };
};

const resolveMetricsMode = (
  env: NodeJS.ProcessEnv,
  runtimeProfile: RuntimeProfile,
): MetricsRuntimeMode => {
  const configured = env.SOCIAL_MONITOR_METRICS_MODE?.trim();
  if (configured === undefined || configured.length === 0) {
    return runtimeProfile === 'beta' ? 'otlp' : 'in-memory';
  }
  if (metricsModes.includes(configured as MetricsRuntimeMode)) {
    return configured as MetricsRuntimeMode;
  }
  throw new Error(
    `SOCIAL_MONITOR_METRICS_MODE must be one of: ${metricsModes.join(', ')}`,
  );
};

const resolveOtlpMetricsEndpoint = (env: NodeJS.ProcessEnv): string => {
  const signalEndpoint = env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT?.trim();
  const baseEndpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  const candidate =
    signalEndpoint && signalEndpoint.length > 0
      ? signalEndpoint
      : baseEndpoint && baseEndpoint.length > 0
        ? `${baseEndpoint.replace(/\/+$/, '')}/v1/metrics`
        : undefined;
  if (candidate === undefined) {
    throw new Error(
      'OTEL_EXPORTER_OTLP_METRICS_ENDPOINT or OTEL_EXPORTER_OTLP_ENDPOINT is required when SOCIAL_MONITOR_METRICS_MODE=otlp',
    );
  }

  let endpoint: URL;
  try {
    endpoint = new URL(candidate);
  } catch {
    throw new Error('OpenTelemetry metrics endpoint must be a valid URL');
  }
  if (!['http:', 'https:'].includes(endpoint.protocol)) {
    throw new Error('OpenTelemetry metrics endpoint must use http or https');
  }
  if (
    endpoint.username.length > 0 ||
    endpoint.password.length > 0 ||
    endpoint.search.length > 0 ||
    endpoint.hash.length > 0
  ) {
    throw new Error(
      'OpenTelemetry metrics endpoint must not contain credentials, query parameters, or fragments',
    );
  }
  if (!endpoint.pathname.endsWith('/v1/metrics')) {
    throw new Error(
      'OpenTelemetry HTTP metrics endpoint must end with /v1/metrics',
    );
  }
  return endpoint.toString();
};

const parseBoundedInteger = (
  raw: string | undefined,
  name: string,
  defaultValue: number,
  minimum: number,
  maximum: number,
): number => {
  if (raw === undefined || raw.trim().length === 0) {
    return defaultValue;
  }
  if (!/^\d+$/.test(raw.trim())) {
    throw new Error(`${name} must be an integer`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  }
  return value;
};

const deploymentEnvironmentFor = (
  runtimeProfile: RuntimeProfile,
): MetricsRuntimeConfig['deploymentEnvironment'] =>
  runtimeProfile === 'beta'
    ? 'production'
    : runtimeProfile === 'deterministic-test'
      ? 'test'
      : 'development';
