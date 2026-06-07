import { safeLabelValue } from '@social-monitor/platform-logging';

export type MetricLabelValue = string | number | boolean | undefined;

export type MetricLabels = Readonly<Record<string, MetricLabelValue>>;

export type CounterMetricInput = {
  readonly name: string;
  readonly value?: number;
  readonly labels?: MetricLabels;
};

export type RecordedCounterMetric = {
  readonly name: string;
  readonly value: number;
  readonly labels: Readonly<Record<string, string>>;
};

export type GaugeMetricInput = {
  readonly name: string;
  readonly value: number;
  readonly labels?: MetricLabels;
};

export type RecordedGaugeMetric = {
  readonly name: string;
  readonly value: number;
  readonly labels: Readonly<Record<string, string>>;
};

export interface MetricsRecorderPort {
  incrementCounter(metric: CounterMetricInput): void;
  recordGauge(metric: GaugeMetricInput): void;
}

export class InMemoryMetricsRecorder implements MetricsRecorderPort {
  private readonly counterMetrics: RecordedCounterMetric[] = [];
  private readonly gaugeMetrics: RecordedGaugeMetric[] = [];

  incrementCounter(metric: CounterMetricInput): void {
    this.counterMetrics.push({
      name: metric.name,
      value: metric.value ?? 1,
      labels: normalizeLabels(metric.labels ?? {}),
    });
  }

  recordGauge(metric: GaugeMetricInput): void {
    this.gaugeMetrics.push({
      name: metric.name,
      value: metric.value,
      labels: normalizeLabels(metric.labels ?? {}),
    });
  }

  counters(name?: string): readonly RecordedCounterMetric[] {
    const counters = name
      ? this.counterMetrics.filter((metric) => metric.name === name)
      : this.counterMetrics;

    return counters.map((metric) => ({
      name: metric.name,
      value: metric.value,
      labels: { ...metric.labels },
    }));
  }

  counterValue(name: string, labels: MetricLabels = {}): number {
    const normalizedLabels = normalizeLabels(labels);

    return this.counterMetrics
      .filter(
        (metric) =>
          metric.name === name && labelsEqual(metric.labels, normalizedLabels),
      )
      .reduce((sum, metric) => sum + metric.value, 0);
  }

  gauges(name?: string): readonly RecordedGaugeMetric[] {
    const gauges = name
      ? this.gaugeMetrics.filter((metric) => metric.name === name)
      : this.gaugeMetrics;

    return gauges.map((metric) => ({
      name: metric.name,
      value: metric.value,
      labels: { ...metric.labels },
    }));
  }

  latestGaugeValue(name: string, labels: MetricLabels = {}): number | undefined {
    const normalizedLabels = normalizeLabels(labels);
    const matching = this.gaugeMetrics.filter(
      (metric) =>
        metric.name === name && labelsEqual(metric.labels, normalizedLabels),
    );

    return matching.at(-1)?.value;
  }
}

const normalizeLabels = (labels: MetricLabels): Readonly<Record<string, string>> =>
  Object.fromEntries(
    Object.entries(labels)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, safeLabelValue(formatLabelValue(value))]),
  );

const formatLabelValue = (value: MetricLabelValue): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  return String(value);
};

const labelsEqual = (
  left: Readonly<Record<string, string>>,
  right: Readonly<Record<string, string>>,
): boolean => {
  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);
  if (leftEntries.length !== rightEntries.length) {
    return false;
  }

  return leftEntries.every(([key, value]) => right[key] === value);
};
