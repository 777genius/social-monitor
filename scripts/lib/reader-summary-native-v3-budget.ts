import { maxPresentationCandidates } from '@social-monitor/summary/adapters/evidence/relevance-reader-summary-v3-promotion';
import { defaultPresentationTimeoutMs, type AgentRuntimePromotionPresentationV3BuilderOptions } from '@social-monitor/summary/adapters/model/agent-runtime-promotion-presentation-v3.builder';
import { defaultTimeoutMs as narrativeDefault, readerSummaryNarrativeAttempts, type AgentRuntimeReaderSummaryModelAdapterOptions } from '@social-monitor/summary/adapters/model/agent-runtime-reader-summary-model.adapter';
import { defaultTimeoutMs as labelDefault, type AgentRuntimeReaderSummaryTopicLabelerOptions } from '@social-monitor/summary/adapters/model/agent-runtime-reader-summary-topic-labeler.adapter';
import { defaultTimeoutMs as relationDefault, type AgentRuntimeReaderSummaryTopicRelationVerifierOptions } from '@social-monitor/summary/adapters/model/agent-runtime-reader-summary-topic-relation-verifier.adapter';
import { agentRuntimeTotalAttempts } from '@social-monitor/summary/features/build-reader-summary-topic-map/build-reader-summary-topic-map.use-case';
import { agentRuntimeTaskDeadlineTimeoutMs } from '@social-monitor/summary/adapters/model/grpc-agent-runtime-client';
import { mimoPresentationMaxTimeoutMs, mimoReaderSummaryBackend } from '@social-monitor/summary/adapters/model/active-reader-summary-generation-profile';

export const NATIVE_V3_PREPARATION_MS = 15 * 60_000;
const timeout = (configured: number | undefined, fallback: number): number => {
  const value = configured ?? fallback;
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Native V3 task timeout is invalid or unbounded');
  return value;
};
/** Model/preparation subtotal only: no invented DB/setup/closure time allowance. */
export const nativeV3ModelPreparationBudget = (options: {
  readonly presentation: AgentRuntimePromotionPresentationV3BuilderOptions;
  readonly narrative: AgentRuntimeReaderSummaryModelAdapterOptions;
  readonly topics?: { readonly label: AgentRuntimeReaderSummaryTopicLabelerOptions;
    readonly relation: AgentRuntimeReaderSummaryTopicRelationVerifierOptions };
}): number => {
  const configuredPresentation = timeout(options.presentation.timeoutMs, defaultPresentationTimeoutMs);
  const presentation = options.presentation.modelBackend === mimoReaderSummaryBackend
    ? Math.min(configuredPresentation, mimoPresentationMaxTimeoutMs) : configuredPresentation;
  const subtotal = NATIVE_V3_PREPARATION_MS +
    maxPresentationCandidates * agentRuntimeTaskDeadlineTimeoutMs(presentation) +
    readerSummaryNarrativeAttempts.length * agentRuntimeTaskDeadlineTimeoutMs(timeout(options.narrative.timeoutMs, narrativeDefault)) +
    (options.topics === undefined ? 0 : agentRuntimeTotalAttempts * (
      agentRuntimeTaskDeadlineTimeoutMs(timeout(options.topics.label.timeoutMs, labelDefault)) +
      agentRuntimeTaskDeadlineTimeoutMs(timeout(options.topics.relation.timeoutMs, relationDefault))));
  if (!Number.isSafeInteger(subtotal) || subtotal <= 0) throw new Error('Native V3 model preparation subtotal overflow');
  return subtotal;
};

export const requireNativeV3ModelPreparationBudget = (declaredBudgetMs: number,
  options: Parameters<typeof nativeV3ModelPreparationBudget>[0]): number => {
  const subtotal = nativeV3ModelPreparationBudget(options);
  if (!Number.isSafeInteger(declaredBudgetMs) || declaredBudgetMs <= subtotal) {
    throw new Error('Native V3 owner budget does not cover resolved model preparation subtotal plus non-model work');
  }
  return subtotal;
};
