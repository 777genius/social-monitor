import type {
  Counter,
  Gauge,
  Meter,
  MetricAttributes,
} from "@opentelemetry/api";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  AggregationTemporality,
  AggregationType,
  MeterProvider,
  PeriodicExportingMetricReader,
  type AggregationOption,
  type InstrumentType,
  type PushMetricExporter,
  type ResourceMetrics,
} from "@opentelemetry/sdk-metrics";
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_SERVICE_NAME,
} from "@opentelemetry/semantic-conventions";
import type { Clock } from "@social-monitor/shared-kernel";

import {
  normalizeMetricLabels,
  requireMetricName,
  type CounterMetricInput,
  type GaugeMetricInput,
  type MetricsRecorderPort,
} from "../metrics-recorder";
import { MetricsRuntime, type MetricsExportState } from "../metrics-runtime";
import type { MetricsRuntimeConfig } from "../metrics-runtime-config";

const successfulExportResultCode = 0;

export const createOpenTelemetryMetricsRuntime = (
  config: MetricsRuntimeConfig,
  clock: Clock,
  exporter: PushMetricExporter = new OTLPMetricExporter({
    url: requireOtlpEndpoint(config),
    concurrencyLimit: 1,
  }),
): MetricsRuntime => {
  const trackedExporter = new HealthTrackingMetricExporter(exporter, clock);
  const reader = new PeriodicExportingMetricReader({
    exporter: trackedExporter,
    exportIntervalMillis: config.exportIntervalMillis,
    exportTimeoutMillis: config.exportTimeoutMillis,
    cardinalityLimits: {
      default: config.cardinalityLimit,
    },
    maxExportBatchSize: 512,
  });
  const provider = new MeterProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: config.serviceName,
      [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: config.deploymentEnvironment,
    }),
    readers: [reader],
  });
  const recorder = new OpenTelemetryMetricsRecorder(
    provider.getMeter("social-monitor"),
  );

  return new MetricsRuntime({
    serviceName: config.serviceName,
    mode: "otlp",
    recorder,
    exportHealth: () => trackedExporter.health(),
    forceFlush: () =>
      provider.forceFlush({ timeoutMillis: config.exportTimeoutMillis }),
    shutdown: () =>
      provider.shutdown({ timeoutMillis: config.exportTimeoutMillis }),
  });
};

export class OpenTelemetryMetricsRecorder implements MetricsRecorderPort {
  private readonly counters = new Map<string, Counter<MetricAttributes>>();
  private readonly gauges = new Map<string, Gauge<MetricAttributes>>();

  constructor(private readonly meter: Meter) {}

  incrementCounter(metric: CounterMetricInput): void {
    const name = requireMetricName(metric.name);
    const value = metric.value ?? 1;
    if (!Number.isFinite(value) || value < 0) {
      return;
    }
    this.counter(name).add(value, normalizeMetricLabels(metric.labels ?? {}));
  }

  recordGauge(metric: GaugeMetricInput): void {
    const name = requireMetricName(metric.name);
    if (!Number.isFinite(metric.value)) {
      return;
    }
    this.gauge(name).record(
      metric.value,
      normalizeMetricLabels(metric.labels ?? {}),
    );
  }

  private counter(name: string): Counter<MetricAttributes> {
    const existing = this.counters.get(name);
    if (existing !== undefined) {
      return existing;
    }
    const created = this.meter.createCounter(name);
    this.counters.set(name, created);
    return created;
  }

  private gauge(name: string): Gauge<MetricAttributes> {
    const existing = this.gauges.get(name);
    if (existing !== undefined) {
      return existing;
    }
    const created = this.meter.createGauge(name);
    this.gauges.set(name, created);
    return created;
  }
}

class HealthTrackingMetricExporter implements PushMetricExporter {
  private exportState: MetricsExportState = "pending";
  private lastExportAt: string | undefined;

  constructor(
    private readonly delegate: PushMetricExporter,
    private readonly clock: Clock,
  ) {}

  export(
    metrics: ResourceMetrics,
    resultCallback: Parameters<PushMetricExporter["export"]>[1],
  ): void {
    this.delegate.export(metrics, (result) => {
      this.exportState =
        result.code === successfulExportResultCode ? "succeeded" : "failed";
      if (result.code === successfulExportResultCode) {
        this.lastExportAt = this.clock.now().toISOString();
      }
      resultCallback(result);
    });
  }

  forceFlush(): Promise<void> {
    return this.delegate.forceFlush();
  }

  shutdown(): Promise<void> {
    return this.delegate.shutdown();
  }

  selectAggregationTemporality?(
    instrumentType: InstrumentType,
  ): AggregationTemporality {
    return (
      this.delegate.selectAggregationTemporality?.(instrumentType) ??
      AggregationTemporality.CUMULATIVE
    );
  }

  selectAggregation?(instrumentType: InstrumentType): AggregationOption {
    return (
      this.delegate.selectAggregation?.(instrumentType) ?? {
        type: AggregationType.DEFAULT,
      }
    );
  }

  health(): {
    readonly exportState: MetricsExportState;
    readonly lastExportAt: string | undefined;
  } {
    return {
      exportState: this.exportState,
      lastExportAt: this.lastExportAt,
    };
  }
}

const requireOtlpEndpoint = (config: MetricsRuntimeConfig): string => {
  if (config.otlpMetricsEndpoint === undefined) {
    throw new Error("OTLP metrics endpoint is required");
  }
  return config.otlpMetricsEndpoint;
};
