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

const metricNamePattern = /^[a-z][a-z0-9_]{0,254}$/;
const labelKeyPattern = /^[a-z][a-z0-9_]{0,63}$/;
const forbiddenLabelKeys = new Set([
  'api_key',
  'authorization',
  'body',
  'email',
  'prompt',
  'raw_text',
  'source_url',
  'token',
  'url',
]);

export class InMemoryMetricsRecorder implements MetricsRecorderPort {
  private readonly counterMetrics: RecordedCounterMetric[] = [];
  private readonly gaugeMetrics: RecordedGaugeMetric[] = [];

  incrementCounter(metric: CounterMetricInput): void {
    requireMetricName(metric.name);
    if (!isValidCounterValue(metric.value ?? 1)) {
      return;
    }
    this.counterMetrics.push({
      name: metric.name,
      value: metric.value ?? 1,
      labels: normalizeMetricLabels(metric.labels ?? {}),
    });
  }

  recordGauge(metric: GaugeMetricInput): void {
    requireMetricName(metric.name);
    if (!Number.isFinite(metric.value)) {
      return;
    }
    this.gaugeMetrics.push({
      name: metric.name,
      value: metric.value,
      labels: normalizeMetricLabels(metric.labels ?? {}),
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
    const normalizedLabels = normalizeMetricLabels(labels);

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
    const normalizedLabels = normalizeMetricLabels(labels);
    const matching = this.gaugeMetrics.filter(
      (metric) =>
        metric.name === name && labelsEqual(metric.labels, normalizedLabels),
    );

    return matching.at(-1)?.value;
  }
}

export const normalizeMetricLabels = (
  labels: MetricLabels,
): Readonly<Record<string, string>> =>
  Object.fromEntries(
    Object.entries(labels)
      .filter(([key]) => isAllowedLabelKey(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, safeLabelValue(formatLabelValue(value))]),
  );

const formatLabelValue = (value: MetricLabelValue): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  return String(value);
};

export const requireMetricName = (name: string): string => {
  if (!metricNamePattern.test(name)) {
    throw new Error(
      `Invalid metric name "${name}"; expected lower_snake_case with at most 255 characters`,
    );
  }
  return name;
};

const isAllowedLabelKey = (key: string): boolean =>
  labelKeyPattern.test(key) && !forbiddenLabelKeys.has(key);

const isValidCounterValue = (value: number): boolean =>
  Number.isFinite(value) && value >= 0;

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
