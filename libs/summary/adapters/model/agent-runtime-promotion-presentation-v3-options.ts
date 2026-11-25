import type { AgentRuntimeClientPort, AgentRuntimeProvider } from "../../ports";
import { positiveIntegerOrFallback } from "./agent-runtime-model-support";
import {
  activeReaderSummaryProvider,
  mimoPresentationMaxTimeoutMs,
  mimoPresentationReasoningEffort,
  mimoReaderSummaryBackend,
} from "./reader-summary-runtime-contract";
import {
  activeReaderSummaryReasoningEffort,
  isCodexGatewayOnlyReaderSummaryModel,
} from "./codex-reader-summary-gateway-route-policy";
import {
  isGatewayReaderSummaryBackend,
  type ReaderSummaryGenerationBackend,
} from "./reader-summary-gateway-route-policy";
import {
  assertActiveReaderSummaryProvider,
  resolveReaderSummaryGenerationIdentity,
} from "./reader-summary-generation-identity-core";
import { resolveReaderSummaryBackendEffort } from "./reader-summary-generation-effort-policy";

// Runtime configuration is resolved once at the adapter boundary. Execution
// itself must never re-read environment or reinterpret model/effort policy.
export const defaultPresentationTimeoutMs = 90_000;

export type AgentRuntimePromotionPresentationV3BuilderOptions = {
  readonly client: AgentRuntimeClientPort;
  readonly agentProvider?: AgentRuntimeProvider;
  readonly providerInstanceId?: string;
  readonly model?: string;
  readonly modelBackend?: ReaderSummaryGenerationBackend;
  /** high for gpt-5.6-sol, none for MiMo, the route effort for a gateway route. */
  readonly reasoningEffort?: string;
  readonly timeoutMs?: number;
  readonly maxOutputTokens?: number;
};

export const resolvePromotionPresentationV3RuntimeOptions = (
  options: AgentRuntimePromotionPresentationV3BuilderOptions,
) => {
  const client = options.client;
  const provider = assertActiveReaderSummaryProvider(options.agentProvider) ??
    activeReaderSummaryProvider;
  const providerInstanceId = options.providerInstanceId;
  const identity = resolveReaderSummaryGenerationIdentity({
    model: options.model, backend: options.modelBackend,
  });
  const model = identity.model;
  const modelBackend = identity.backend;
  const cliEffort = modelBackend === mimoReaderSummaryBackend
    ? mimoPresentationReasoningEffort : activeReaderSummaryReasoningEffort;
  // Gateway routes own their effort, including gateway-only Codex models.
  if (!isGatewayReaderSummaryBackend(modelBackend) &&
    !isCodexGatewayOnlyReaderSummaryModel(model) &&
    options.reasoningEffort !== undefined && options.reasoningEffort !== cliEffort) {
    throw new Error("Presentation reasoning effort conflicts with purpose policy");
  }
  const reasoningEffort = resolveReaderSummaryBackendEffort(
    modelBackend, options.reasoningEffort, cliEffort, model);
  const configuredTimeoutMs = positiveIntegerOrFallback(options.timeoutMs, defaultPresentationTimeoutMs);
  const timeoutMs = modelBackend === mimoReaderSummaryBackend
    ? Math.min(configuredTimeoutMs, mimoPresentationMaxTimeoutMs) : configuredTimeoutMs;
  const maxOutputTokens = positiveIntegerOrFallback(options.maxOutputTokens, 2_400);
  return { client, provider, providerInstanceId, model, modelBackend, reasoningEffort, timeoutMs, maxOutputTokens };
};

export { resolveAgentRuntimePromotionPresentationV3BuilderOptions } from "./agent-runtime-promotion-presentation-v3-env-options";
