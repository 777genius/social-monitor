import type { AgentRuntimeReaderSummaryModelAdapterOptions } from "./agent-runtime-reader-summary-options";
import { nonEmptyOrFallback, positiveIntegerOrFallback } from "./agent-runtime-model-support";
import {
  type activeReaderSummaryProvider,
  activeReaderSummaryReasoningEffort,
  resolveReaderSummaryBackendEffort,
  resolveReaderSummaryGenerationIdentity,
  type ReaderSummaryGenerationBackend,
  frozenLegacyReaderSummaryRecoveryContract,
} from "./active-reader-summary-generation-profile";

/** Immutable route/backend/dispatch limits; no client I/O or mutable task state. */
export type AgentRuntimeReaderSummaryRuntimeSettings = {
  readonly agentProvider: typeof activeReaderSummaryProvider;
  readonly providerInstanceId?: string;
  readonly model: string;
  readonly modelBackend: ReaderSummaryGenerationBackend;
  readonly reasoningEffort: string;
  readonly legacyRecovery: boolean;
  readonly evalDatasetVersion: string;
  readonly timeoutMs: number;
  readonly maxOutputTokens: number;
  readonly inputTokenDivisor: number;
};

const defaultEvalDatasetVersion = "reader_summary.eval.mvp.v1";
export const defaultTimeoutMs = 600_000;
const defaultMaxOutputTokens = 16_000;
const defaultInputTokenDivisor = 4;

export const resolveAgentRuntimeReaderSummaryRuntimeSettings = (
  options: AgentRuntimeReaderSummaryModelAdapterOptions,
): AgentRuntimeReaderSummaryRuntimeSettings => {
  const generationIdentity = resolveReaderSummaryGenerationIdentity({
    provider: options.agentProvider,
    model: options.model,
    backend: options.modelBackend,
    legacyRecovery: options.legacyRecoveryContract !== undefined,
  });
  const legacyRecovery = options.legacyRecoveryContract !== undefined;
  if (
    options.legacyRecoveryContract !== undefined &&
    options.legacyRecoveryContract !== frozenLegacyReaderSummaryRecoveryContract
  ) {
    throw new Error("Reader summary legacy recovery contract is not canonical");
  }
  return {
    agentProvider: generationIdentity.provider,
    modelBackend: generationIdentity.backend,
    providerInstanceId: options.providerInstanceId,
    model: generationIdentity.model,
    legacyRecovery,
    reasoningEffort: resolveReaderSummaryBackendEffort(
      generationIdentity.backend,
      options.reasoningEffort,
      legacyRecovery ? "xhigh" : activeReaderSummaryReasoningEffort,
      generationIdentity.model,
    ),
    evalDatasetVersion: nonEmptyOrFallback(
      options.evalDatasetVersion,
      defaultEvalDatasetVersion,
    ),
    timeoutMs: positiveIntegerOrFallback(
      options.timeoutMs,
      defaultTimeoutMs,
    ),
    maxOutputTokens: positiveIntegerOrFallback(
      options.maxOutputTokens,
      defaultMaxOutputTokens,
    ),
    inputTokenDivisor: positiveIntegerOrFallback(
      options.inputTokenDivisor,
      defaultInputTokenDivisor,
    ),
  };
};
