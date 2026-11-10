import type { AgentRuntimeProvider } from "../../ports";
import { readerSummaryRouteControls } from "./active-reader-summary-generation-profile";
import { nonEmptyOrFallback, positiveIntegerOrFallback } from "./agent-runtime-model-support";
import { defaultAgentRuntimeSummaryModel, type AgentRuntimeSummaryModelAdapterOptions } from "./agent-runtime-summary-options";

/** Model route and dispatch limits are selected before execution, not in the transport adapter. */
export type AgentRuntimeSummaryRuntimeSettings = {
  readonly agentProvider: AgentRuntimeProvider;
  readonly providerInstanceId?: string;
  readonly model: string;
  readonly routeControls: Readonly<Record<string, unknown>>;
  readonly promptVersion: string;
  readonly evalDatasetVersion: string;
  readonly timeoutMs: number;
  readonly maxOutputTokens: number;
  readonly inputTokenDivisor: number;
};

const defaultAgentProvider: AgentRuntimeProvider = "codex";
const defaultPromptVersion = "summary.prompt.agent_runtime.v1";
const defaultEvalDatasetVersion = "summary.eval.mvp.v1";
const defaultTimeoutMs = 120_000;
const defaultMaxOutputTokens = 4_000;
const defaultInputTokenDivisor = 4;

export const resolveAgentRuntimeSummaryRuntimeSettings = (
  options: AgentRuntimeSummaryModelAdapterOptions,
): AgentRuntimeSummaryRuntimeSettings => ({
  agentProvider: options.agentProvider ?? defaultAgentProvider,
  providerInstanceId: options.providerInstanceId,
  model: nonEmptyOrFallback(options.model, defaultAgentRuntimeSummaryModel),
  routeControls: options.modelBackend === undefined ? {} :
    readerSummaryRouteControls(options.modelBackend, options.reasoningEffort ?? "default"),
  promptVersion: nonEmptyOrFallback(options.promptVersion, defaultPromptVersion),
  evalDatasetVersion: nonEmptyOrFallback(options.evalDatasetVersion, defaultEvalDatasetVersion),
  timeoutMs: positiveIntegerOrFallback(options.timeoutMs, defaultTimeoutMs),
  maxOutputTokens: positiveIntegerOrFallback(options.maxOutputTokens, defaultMaxOutputTokens),
  inputTokenDivisor: positiveIntegerOrFallback(options.inputTokenDivisor, defaultInputTokenDivisor),
});
