import {
  AggregationTemporality,
  InMemoryMetricExporter,
  type PushMetricExporter,
} from "@opentelemetry/sdk-metrics";
import { FixedClock } from "@social-monitor/shared-kernel";

import type { MetricsRuntimeConfig } from "../metrics-runtime-config";
import { createOpenTelemetryMetricsRuntime } from "./opentelemetry-metrics-runtime";

const config: MetricsRuntimeConfig = {
  serviceName: "metrics-test",
  mode: "otlp",
  runtimeProfile: "deterministic-test",
  deploymentEnvironment: "test",
  otlpMetricsEndpoint: "http://collector.test/v1/metrics",
  exportIntervalMillis: 60_000,
  exportTimeoutMillis: 30_000,
  cardinalityLimit: 32,
};

describe("OpenTelemetry metrics runtime", () => {
  it("exports counters and gauges with safe resource attributes and labels", async () => {
    const exporter = new InMemoryMetricExporter(
      AggregationTemporality.CUMULATIVE,
    );
    const runtime = createOpenTelemetryMetricsRuntime(
      config,
      new FixedClock(new Date("2026-07-23T12:00:00.000Z")),
      exporter,
    );

    runtime.recorder.incrementCounter({
      name: "queue_commands_enqueued_total",
      value: 2,
      labels: {
        command_type: "ingestion.scan.execute",
        prompt: "private prompt",
        status: "enqueued",
      },
    });
    runtime.recorder.recordGauge({
      name: "queue_commands_backlog",
      value: 3,
      labels: { queue: "scan" },
    });
    await runtime.forceFlush();

    const [batch] = exporter.getMetrics();
    expect(batch?.resource.attributes).toMatchObject({
      "service.name": "metrics-test",
      "deployment.environment.name": "test",
    });
    const metrics = batch?.scopeMetrics.flatMap((scope) => scope.metrics) ?? [];
    const counter = metrics.find(
      (metric) => metric.descriptor.name === "queue_commands_enqueued_total",
    );
    const gauge = metrics.find(
      (metric) => metric.descriptor.name === "queue_commands_backlog",
    );

    expect(counter?.dataPoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          attributes: {
            command_type: "ingestion.scan.execute",
            status: "enqueued",
          },
          value: 2,
        }),
      ]),
    );
    expect(gauge?.dataPoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          attributes: { queue: "scan" },
          value: 3,
        }),
      ]),
    );
    expect(runtime.health()).toEqual({
      serviceName: "metrics-test",
      mode: "otlp",
      lifecycle: "active",
      exportState: "succeeded",
      lastExportAt: "2026-07-23T12:00:00.000Z",
    });

    await runtime.shutdown();
    await runtime.shutdown();
    expect(runtime.health().lifecycle).toBe("stopped");
  });

  it("retains the last successful export timestamp after a later failure", async () => {
    let now = new Date("2026-07-23T12:00:00.000Z");
    let exportResult:
      { readonly code: 0 } | { readonly code: 1; readonly error: Error } = {
      code: 0,
    };
    const exporter: PushMetricExporter = {
      export: (_metrics, resultCallback) => resultCallback(exportResult),
      forceFlush: async () => undefined,
      shutdown: async () => undefined,
    };
    const runtime = createOpenTelemetryMetricsRuntime(
      config,
      { now: () => now },
      exporter,
    );

    runtime.recorder.incrementCounter({
      name: "queue_commands_enqueued_total",
    });
    await runtime.forceFlush();
    now = new Date("2026-07-23T12:01:00.000Z");
    exportResult = { code: 1, error: new Error("collector unavailable") };
    runtime.recorder.incrementCounter({
      name: "queue_commands_enqueued_total",
    });
    await runtime.forceFlush();

    expect(runtime.health()).toMatchObject({
      exportState: "failed",
      lastExportAt: "2026-07-23T12:00:00.000Z",
    });
    await runtime.shutdown();
  });
});
