import { gatewayRouteModel } from "./reader-summary-gateway-route-policy";
import type { ReaderSummaryGenerationBackend } from "./reader-summary-gateway-route-policy";
import { mimoReaderSummaryBackend, mimoReaderSummaryModel } from "./reader-summary-runtime-contract";
import { resolveReaderSummaryBackendSelectionFromEnv } from "./reader-summary-backend-selection";
export { backendMessage } from "./reader-summary-backend-selection";
import {
  activeReaderSummaryModel,
  codexReaderSummaryBackend,
} from "./codex-reader-summary-route";
import { parseActiveReaderSummaryModel } from "./reader-summary-generation-identity-core";

// Daily topic and relation calls share the summary backend, while their
// individual model overrides remain purpose-specific.
export const resolveReaderSummaryDailyTaskIdentityFromEnv = (
  env: NodeJS.ProcessEnv,
  purposeModel: string | undefined,
): { readonly model: string; readonly modelBackend: ReaderSummaryGenerationBackend } => {
  const selection = resolveReaderSummaryBackendSelectionFromEnv(env);
  if (selection.kind === "codex-gateway") {
    return { model: gatewayRouteModel(selection.route, purposeModel), modelBackend: codexReaderSummaryBackend };
  }
  if (selection.kind === "cli") {
    return {
      model: parseActiveReaderSummaryModel(
        purposeModel ?? env.AGENT_RUNTIME_READER_SUMMARY_MODEL,
      ) ?? activeReaderSummaryModel,
      modelBackend: "openai-chatgpt",
    };
  }
  if (selection.kind === "gateway") {
    return { model: gatewayRouteModel(selection.route, purposeModel), modelBackend: selection.route.backend };
  }
  if (purposeModel !== undefined && purposeModel.trim() !== mimoReaderSummaryModel) {
    throw new Error("MiMo reader summary model conflicts with purpose policy");
  }
  return { model: mimoReaderSummaryModel, modelBackend: mimoReaderSummaryBackend };
};
