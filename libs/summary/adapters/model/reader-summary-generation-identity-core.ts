import { parseActiveReaderSummaryModel, assertActiveReaderSummaryProvider } from "./reader-summary-generation-exact-settings";
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
    const gatewayModel = input.model;
    if (input.legacyRecovery || !isGatewayReaderSummaryModel(gatewayModel) ||
      isCodexGatewayOnlyReaderSummaryModel(gatewayModel) ||
      (input.backend === kimiCodeReaderSummaryBackend &&
        gatewayModel !== kimiCodeReaderSummaryModel)) {
      throw new Error("Gateway reader summary model conflicts with purpose policy");
    }
    return { provider, model: gatewayModel, backend: input.backend };
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

export { parseActiveReaderSummaryModel, assertActiveReaderSummaryProvider };
export { parseActiveReaderSummaryReasoningEffort } from "./reader-summary-generation-exact-settings";
