import {
  gatewayRouteModel,
  resolveGatewayReaderSummaryRoute,
} from "./reader-summary-gateway-route-policy";
import type { ReaderSummaryGenerationBackend } from "./reader-summary-gateway-route-policy";
import { mimoReaderSummaryBackend, mimoReaderSummaryModel, activeReaderSummaryProvider } from "./reader-summary-runtime-contract";
import {
  activeReaderSummaryModel,
  codexReaderSummaryBackend,
  resolveCodexGatewayReaderSummaryRoute,
} from "./codex-reader-summary-route";
import {
  parseActiveReaderSummaryModel,
  parseActiveReaderSummaryReasoningEffort,
  resolveReaderSummaryGenerationIdentity,
} from "./reader-summary-generation-identity-core";

/**
 * Shared effort of daily tasks: a gateway route owns it, CLI backends use the
 * purpose effort. The Codex settings stay validated under a Codex gateway route.
 */
export const resolveReaderSummaryReasoningEffortFromEnv = (
  env: NodeJS.ProcessEnv,
): string | undefined => {
  const gateway = resolveGatewayReaderSummaryRoute(env);
  if (gateway !== undefined) return gateway.reasoningEffort;
  const shared = parseActiveReaderSummaryReasoningEffort(
    env.AGENT_RUNTIME_READER_SUMMARY_REASONING_EFFORT ?? env.AGENT_RUNTIME_REASONING_EFFORT);
  return resolveCodexGatewayReaderSummaryRoute(env)?.reasoningEffort ?? shared;
};

export const resolveReaderSummaryGenerationIdentityFromEnv = (
  env: NodeJS.ProcessEnv,
): { readonly provider: typeof activeReaderSummaryProvider; readonly model: string;
  readonly backend: ReaderSummaryGenerationBackend } => {
  // The historic shared model remains the Codex default for all daily
  // workflows; MiMo and gateway selection use the backend and
  // purpose-specific models.
  const sharedModel = parseActiveReaderSummaryModel(
    env.AGENT_RUNTIME_READER_SUMMARY_MODEL,
  );
  const generationModel =
    env.AGENT_RUNTIME_READER_SUMMARY_GENERATION_MODEL?.trim() || undefined;
  const backend = env.AGENT_RUNTIME_READER_SUMMARY_BACKEND?.trim();
  const codexGateway = resolveCodexGatewayReaderSummaryRoute(env);
  if (codexGateway !== undefined) {
    return resolveReaderSummaryGenerationIdentity({
      provider: env.AGENT_RUNTIME_PROVIDER,
      model: gatewayRouteModel(codexGateway, generationModel),
    });
  }
  if (backend === undefined || backend === "" || backend === "openai-chatgpt") {
    return resolveReaderSummaryGenerationIdentity({
      provider: env.AGENT_RUNTIME_PROVIDER,
      model: generationModel ?? sharedModel,
    });
  }
  const gateway = resolveGatewayReaderSummaryRoute(env);
  if (gateway !== undefined) {
    return resolveReaderSummaryGenerationIdentity({
      provider: env.AGENT_RUNTIME_PROVIDER,
      backend: gateway.backend,
      model: gatewayRouteModel(gateway, generationModel),
    });
  }
  if (backend !== mimoReaderSummaryBackend) {
    throw new Error(backendMessage);
  }
  return resolveReaderSummaryGenerationIdentity({
    provider: env.AGENT_RUNTIME_PROVIDER,
    backend,
    model: generationModel,
  });
};

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

const backendMessage =
  "AGENT_RUNTIME_READER_SUMMARY_BACKEND must be openai-chatgpt, xiaomi-mimo-token-plan, kimi-code or openrouter";

