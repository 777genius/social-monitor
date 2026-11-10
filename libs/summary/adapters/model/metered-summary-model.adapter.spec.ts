import type { MetricsRecorderPort } from '@social-monitor/platform-metrics';
import type {
  ProviderSummaryAttempt,
  SummaryModelInput,
  SummaryModelPort,
  SummaryModelRoute,
} from '../../ports';
import { MeteredSummaryModelAdapter } from './metered-summary-model.adapter';

const route = {
  provider: 'synthetic-summary',
  model: 'synthetic-model',
} as SummaryModelRoute;
const input = {} as SummaryModelInput;
const attempt = {
  draft: {
    usage: {
      inputTokens: 13,
      outputTokens: 5,
      estimatedCostUsd: 0.007,
    },
  },
} as ProviderSummaryAttempt;

describe('MeteredSummaryModelAdapter', () => {
  it('records the exact request, token and cost taxonomy without changing the attempt', async () => {
    const incrementCounter = jest.fn();
    const metrics = { incrementCounter } as unknown as MetricsRecorderPort;
    const summarize = jest.fn().mockResolvedValue(attempt);
    const delegate = { summarize } as unknown as SummaryModelPort;
    const adapter = new MeteredSummaryModelAdapter(delegate, metrics);

    await expect(adapter.summarize(input, route)).resolves.toBe(attempt);
    expect(summarize).toHaveBeenCalledWith(input, route);
    expect(incrementCounter.mock.calls.map(([event]) => event)).toEqual([
      {
        name: 'summary_model_requests_total',
        labels: { model: 'synthetic-model', provider: 'synthetic-summary', status: 'started' },
      },
      {
        name: 'summary_model_requests_total',
        labels: { model: 'synthetic-model', provider: 'synthetic-summary', status: 'succeeded' },
      },
      {
        name: 'summary_model_tokens_total',
        value: 13,
        labels: { model: 'synthetic-model', provider: 'synthetic-summary', token_type: 'input' },
      },
      {
        name: 'summary_model_tokens_total',
        value: 5,
        labels: { model: 'synthetic-model', provider: 'synthetic-summary', token_type: 'output' },
      },
      {
        name: 'summary_model_estimated_cost_usd',
        value: 0.007,
        labels: { model: 'synthetic-model', provider: 'synthetic-summary' },
      },
    ]);
  });

  it('classifies delegate failure, emits no usage and rethrows the same error', async () => {
    const error = new Error('synthetic rejection');
    const classifyError = jest.fn().mockReturnValue({
      kind: 'provider_unavailable',
      retryable: true,
      message: 'unavailable',
    });
    const delegate = {
      summarize: jest.fn().mockRejectedValue(error),
      classifyError,
    } as unknown as SummaryModelPort;
    const incrementCounter = jest.fn();
    const adapter = new MeteredSummaryModelAdapter(
      delegate,
      { incrementCounter } as unknown as MetricsRecorderPort,
    );

    await expect(adapter.summarize(input, route)).rejects.toBe(error);
    expect(classifyError).toHaveBeenCalledWith(error);
    expect(incrementCounter.mock.calls.map(([event]) => event)).toEqual([
      {
        name: 'summary_model_requests_total',
        labels: { model: 'synthetic-model', provider: 'synthetic-summary', status: 'started' },
      },
      {
        name: 'summary_model_requests_total',
        labels: {
          failure_kind: 'provider_unavailable',
          model: 'synthetic-model',
          provider: 'synthetic-summary',
          status: 'failed',
        },
      },
    ]);
  });

  it('preserves failure handling when usage metrics themselves reject recording', async () => {
    const telemetryError = new Error('synthetic recorder failure');
    const incrementCounter = jest.fn().mockImplementation((event: { name: string }) => {
      if (event.name === 'summary_model_tokens_total') throw telemetryError;
    });
    const classifyError = jest.fn().mockReturnValue({
      kind: 'invalid_schema',
      retryable: false,
      message: 'failure',
    });
    const delegate = {
      summarize: jest.fn().mockResolvedValue(attempt),
      classifyError,
    } as unknown as SummaryModelPort;
    const adapter = new MeteredSummaryModelAdapter(
      delegate,
      { incrementCounter } as unknown as MetricsRecorderPort,
    );

    await expect(adapter.summarize(input, route)).rejects.toBe(telemetryError);
    expect(classifyError).toHaveBeenCalledWith(telemetryError);
    expect(incrementCounter.mock.calls.map(([event]) => event.name)).toEqual([
      'summary_model_requests_total',
      'summary_model_requests_total',
      'summary_model_tokens_total',
      'summary_model_requests_total',
    ]);
    expect(incrementCounter.mock.calls[3]?.[0]).toEqual({
      name: 'summary_model_requests_total',
      labels: {
        failure_kind: 'invalid_schema',
        model: 'synthetic-model',
        provider: 'synthetic-summary',
        status: 'failed',
      },
    });
  });

  it('keeps route, estimate and raw-response validation as transparent delegate calls', () => {
    const policy = {} as Parameters<SummaryModelPort['route']>[1];
    const budget = {} as Parameters<SummaryModelPort['route']>[2];
    const estimate = { inputTokens: 10 } as ReturnType<SummaryModelPort['estimate']>;
    const validation = { ok: true } as ReturnType<SummaryModelPort['validateRawProviderResponse']>;
    const delegate = {
      route: jest.fn().mockReturnValue(route),
      estimate: jest.fn().mockReturnValue(estimate),
      validateRawProviderResponse: jest.fn().mockReturnValue(validation),
    } as unknown as SummaryModelPort;
    const adapter = new MeteredSummaryModelAdapter(
      delegate,
      { incrementCounter: jest.fn() } as unknown as MetricsRecorderPort,
    );

    expect(adapter.route(input, policy, budget)).toBe(route);
    expect(delegate.route).toHaveBeenCalledWith(input, policy, budget);
    expect(adapter.estimate(input, route)).toBe(estimate);
    expect(delegate.estimate).toHaveBeenCalledWith(input, route);
    expect(adapter.validateRawProviderResponse(attempt)).toBe(validation);
    expect(delegate.validateRawProviderResponse).toHaveBeenCalledWith(attempt);
  });
});
