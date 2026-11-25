import type { MetricsRecorderPort } from '@social-monitor/platform-metrics';
import type { ProviderSummaryAttempt, SummaryModelRoute } from '../../ports';
import {
  recordSummaryModelRequest,
  recordSummaryModelUsage,
} from './summary-model-metrics';

type MeterSummaryModelAttemptParams = {
  readonly metrics: MetricsRecorderPort;
  readonly route: SummaryModelRoute;
  readonly execute: () => Promise<ProviderSummaryAttempt>;
  readonly classifyFailure: (error: unknown) => string;
};

/** Own the telemetry lifecycle; the adapter remains a transparent provider port. */
export const meterSummaryModelAttempt = async (
  params: MeterSummaryModelAttemptParams,
): Promise<ProviderSummaryAttempt> => {
  recordSummaryModelRequest(params.metrics, params.route, 'started');
  try {
    const attempt = await params.execute();
    const usage = attempt.draft.usage;
    recordSummaryModelRequest(params.metrics, params.route, 'succeeded');
    recordSummaryModelUsage(params.metrics, params.route, usage);
    return attempt;
  } catch (error) {
    const kind = params.classifyFailure(error);
    recordSummaryModelRequest(params.metrics, params.route, 'failed', kind);
    throw error;
  }
};
