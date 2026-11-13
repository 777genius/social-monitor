import {
  gatewayDefaultReasoningEffort,
  isGatewayReaderSummaryBackend,
  isGatewayReaderSummaryModel,
  isGatewayReaderSummaryReasoningEffort,
  kimiCodeReaderSummaryBackend,
  kimiCodeReaderSummaryModel,
} from "./reader-summary-gateway-route-policy";
import type {
  ReaderSummaryGenerationBackend,
  GatewayReaderSummaryBackend,
} from "./reader-summary-gateway-route-policy";
import {
  activeReaderSummaryProvider,
  mimoReaderSummaryBackend,
  mimoReaderSummaryModel,
} from "./reader-summary-runtime-contract";
import {
  activeReaderSummaryModel,
  activeReaderSummaryReasoningEffort,
  codexGatewayReaderSummaryReasoningEffort,
  codexReaderSummaryBackend,
  isCodexGatewayOnlyReaderSummaryModel,
  isCodexGatewayReaderSummaryRoute,
} from "./codex-reader-summary-route";

/** A gateway task names its backend; the default effort sends no reasoning control. */
export const readerSummaryRouteControls = (
  backend: ReaderSummaryGenerationBackend,
  reasoningEffort: string,
): { readonly modelBackend?: GatewayReaderSummaryBackend; readonly reasoningEffort?: string } => ({
  ...(isGatewayReaderSummaryBackend(backend) ? { modelBackend: backend } : {}),
  ...(reasoningEffort === gatewayDefaultReasoningEffort ? {} : { reasoningEffort }),
});

/**
 * Effort of one adapter: a gateway backend defaults to sending none and
 * accepts only gateway efforts, a gateway-only Codex model takes one of its
 * allowed efforts, and every other CLI model keeps its fixed effort.
 */
export const resolveReaderSummaryBackendEffort = (
  backend: ReaderSummaryGenerationBackend,
  requested: string | undefined,
  cliEffort: string,
  model: string,
): string => {
  if (isGatewayReaderSummaryBackend(backend)) {
    const effort = requested ?? gatewayDefaultReasoningEffort;
    if (isGatewayReaderSummaryReasoningEffort(effort)) return effort;
  } else if (backend === codexReaderSummaryBackend && isCodexGatewayOnlyReaderSummaryModel(model)) {
    const effort = requested ?? codexGatewayReaderSummaryReasoningEffort(model);
    if (isCodexGatewayReaderSummaryRoute(model, effort)) return effort;
  } else if ((requested ?? cliEffort) === cliEffort) {
    return cliEffort;
  }
  throw new Error("Reader summary execution profile and effort conflict");
};

/** Daily task adapters: MiMo and gateway backends pin the model they were configured with. */
export const assertReaderSummaryBackendModel = (
  backend: ReaderSummaryGenerationBackend,
  model: string,
): void => {
  if (backend === mimoReaderSummaryBackend && model !== mimoReaderSummaryModel) {
    throw new Error("MiMo reader summary model conflicts with purpose policy");
  }
  if (isGatewayReaderSummaryBackend(backend)) {
    resolveReaderSummaryGenerationIdentity({ backend, model });
  }
};

export const resolveReaderSummaryGenerationIdentity = (input: {
  readonly provider?: string;
  readonly model?: string;
  readonly backend?: ReaderSummaryGenerationBackend;
  readonly legacyRecovery?: boolean;
}): { readonly provider: typeof activeReaderSummaryProvider; readonly model: string;
  readonly backend: ReaderSummaryGenerationBackend } => {
  const provider = assertActiveReaderSummaryProvider(input.provider) ??
    activeReaderSummaryProvider;
  if (input.backend === mimoReaderSummaryBackend) {
    if (input.legacyRecovery ||
      (input.model !== undefined && input.model !== mimoReaderSummaryModel)) {
      throw new Error("MiMo reader summary model conflicts with purpose policy");
    }
    return { provider, model: mimoReaderSummaryModel, backend: mimoReaderSummaryBackend };
  }
  if (isGatewayReaderSummaryBackend(input.backend)) {
    if (input.legacyRecovery || !isGatewayReaderSummaryModel(input.model) ||
      isCodexGatewayOnlyReaderSummaryModel(input.model) ||
      (input.backend === kimiCodeReaderSummaryBackend &&
        input.model !== kimiCodeReaderSummaryModel)) {
      throw new Error("Gateway reader summary model conflicts with purpose policy");
    }
    return { provider, model: input.model, backend: input.backend };
  }
  // A gateway-only Codex model never serves the frozen legacy recovery.
  if (isCodexGatewayOnlyReaderSummaryModel(input.model)) {
    if (input.legacyRecovery) {
      throw new Error("Codex gateway reader summary model conflicts with legacy recovery");
    }
    return { provider, model: input.model, backend: codexReaderSummaryBackend };
  }
  return {
    provider,
    model: parseActiveReaderSummaryModel(input.model) ?? activeReaderSummaryModel,
    backend: "openai-chatgpt",
  };
};

export const parseActiveReaderSummaryModel = (
  value: string | undefined,
): typeof activeReaderSummaryModel | undefined =>
  parseOptionalExact(
    value,
    activeReaderSummaryModel,
    "AGENT_RUNTIME_READER_SUMMARY_MODEL must be gpt-5.6-sol",
  );

export const parseActiveReaderSummaryReasoningEffort = (
  value: string | undefined,
): typeof activeReaderSummaryReasoningEffort | undefined =>
  parseOptionalExact(
    value,
    activeReaderSummaryReasoningEffort,
    "AGENT_RUNTIME_READER_SUMMARY_REASONING_EFFORT must be high",
  );

export const assertActiveReaderSummaryProvider = (
  value: string | undefined,
): typeof activeReaderSummaryProvider | undefined =>
  parseOptionalExact(
    value,
    activeReaderSummaryProvider,
    'AGENT_RUNTIME_PROVIDER must be "codex" for active reader summaries',
  );

const parseOptionalExact = <Expected extends string>(
  value: string | undefined,
  expected: Expected,
  message: string,
): Expected | undefined => {
  if (value === undefined || value.trim().length === 0) return undefined;
  if (value.trim() !== expected) throw new Error(message);
  return expected;
};
