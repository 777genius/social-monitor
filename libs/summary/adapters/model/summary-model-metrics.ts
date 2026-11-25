import type { MetricLabels, MetricsRecorderPort } from '@social-monitor/platform-metrics';
import type { ProviderSummaryAttempt, SummaryModelRoute } from '../../ports';

// The telemetry taxonomy belongs to this provider-neutral boundary.
// The decorator retains ownership of call order, error classification and rethrow.
export const recordSummaryModelUsage = (
  metrics: MetricsRecorderPort,
  route: SummaryModelRoute,
  usage: ProviderSummaryAttempt['draft']['usage'],
): void => {
  metrics.incrementCounter({
    name: 'summary_model_tokens_total',
    value: usage.inputTokens,
    labels: {
      model: route.model,
      provider: route.provider,
      token_type: 'input',
    },
  });
  metrics.incrementCounter({
    name: 'summary_model_tokens_total',
    value: usage.outputTokens,
    labels: {
      model: route.model,
      provider: route.provider,
      token_type: 'output',
    },
  });
  metrics.incrementCounter({
    name: 'summary_model_estimated_cost_usd',
    value: usage.estimatedCostUsd,
    labels: {
      model: route.model,
      provider: route.provider,
    },
  });
};

export const recordSummaryModelRequest = (
  metrics: MetricsRecorderPort,
  route: SummaryModelRoute,
  status: 'started' | 'succeeded' | 'failed',
  failureKind?: string,
): void => {
  const labels: MetricLabels = {
    ...(failureKind === undefined ? {} : { failure_kind: failureKind }),
    model: route.model,
    provider: route.provider,
    status,
  };

  metrics.incrementCounter({
    name: 'summary_model_requests_total',
    labels,
  });
};
