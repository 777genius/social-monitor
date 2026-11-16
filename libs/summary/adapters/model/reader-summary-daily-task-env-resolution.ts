import { gatewayRouteModel, resolveGatewayReaderSummaryRoute } from "./reader-summary-gateway-route-policy";
import type { ReaderSummaryGenerationBackend } from "./reader-summary-gateway-route-policy";
import { mimoReaderSummaryBackend, mimoReaderSummaryModel } from "./reader-summary-runtime-contract";
import {
  activeReaderSummaryModel,
  codexReaderSummaryBackend,
  resolveCodexGatewayReaderSummaryRoute,
} from "./codex-reader-summary-route";
import { parseActiveReaderSummaryModel } from "./reader-summary-generation-identity-core";

// Shared backend diagnostic: daily tasks and generation reject unknown backends identically.
export const backendMessage =
  "AGENT_RUNTIME_READER_SUMMARY_BACKEND must be openai-chatgpt, xiaomi-mimo-token-plan, kimi-code or openrouter";

// Daily topic and relation calls share the summary backend, while their
// individual model overrides remain purpose-specific.
export const resolveReaderSummaryDailyTaskIdentityFromEnv = (
  env: NodeJS.ProcessEnv,
  purposeModel: string | undefined,
): { readonly model: string; readonly modelBackend: ReaderSummaryGenerationBackend } => {
  const backend = env.AGENT_RUNTIME_READER_SUMMARY_BACKEND?.trim();
  const codexGateway = resolveCodexGatewayReaderSummaryRoute(env);
  if (codexGateway !== undefined) {
    return { model: gatewayRouteModel(codexGateway, purposeModel), modelBackend: codexReaderSummaryBackend };
  }
  if (backend === undefined || backend === "" || backend === "openai-chatgpt") {
    return {
      model: parseActiveReaderSummaryModel(
        purposeModel ?? env.AGENT_RUNTIME_READER_SUMMARY_MODEL,
      ) ?? activeReaderSummaryModel,
      modelBackend: "openai-chatgpt",
    };
  }
  const gateway = resolveGatewayReaderSummaryRoute(env);
  if (gateway !== undefined) {
    return { model: gatewayRouteModel(gateway, purposeModel), modelBackend: gateway.backend };
  }
  if (backend !== mimoReaderSummaryBackend) {
    throw new Error(backendMessage);
  }
  if (purposeModel !== undefined && purposeModel.trim() !== mimoReaderSummaryModel) {
    throw new Error("MiMo reader summary model conflicts with purpose policy");
  }
  return { model: mimoReaderSummaryModel, modelBackend: backend };
};
