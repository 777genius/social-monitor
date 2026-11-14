import {
  isGatewayReaderSummaryBackend,
  isGatewayReaderSummaryModel,
  kimiCodeReaderSummaryBackend,
  kimiCodeReaderSummaryModel,
} from "./reader-summary-gateway-route-policy";
import type {
  ReaderSummaryGenerationBackend,
} from "./reader-summary-gateway-route-policy";
import {
  activeReaderSummaryProvider,
  mimoReaderSummaryBackend,
  mimoReaderSummaryModel,
} from "./reader-summary-runtime-contract";
import {
  activeReaderSummaryModel,
  activeReaderSummaryReasoningEffort,
  codexReaderSummaryBackend,
  isCodexGatewayOnlyReaderSummaryModel,
} from "./codex-reader-summary-route";

// Preserve the previous public direct-import surface without mixing effort
// admission with pure provider/model identity.
export {
  readerSummaryRouteControls,
  resolveReaderSummaryBackendEffort,
} from "./reader-summary-generation-effort-policy";

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
