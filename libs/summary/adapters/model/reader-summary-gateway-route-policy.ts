import { gatewayLlmRuntimeEngine } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import {
  activeReaderSummaryModel,
  type codexReaderSummaryBackend,
  isCodexGatewayOnlyReaderSummaryModel,
  isCodexGatewayReaderSummaryRoute,
} from "./codex-reader-summary-route";
import { type mimoReaderSummaryBackend, mimoReaderSummaryModel } from "./reader-summary-runtime-contract";

/**
 * Gateway-only backends. They run through account-gateway profiles, so their
 * physical model and reasoning policy come from the gateway route, never from
 * the Codex or MiMo CLI defaults. The task provider stays "codex": it names
 * the Responses protocol family the verifiers already bind.
 */
export const kimiCodeReaderSummaryBackend = "kimi-code" as const;
export const openRouterReaderSummaryBackend = "openrouter" as const;
/** Kimi Code serves exactly this model, always reasons and rejects any reasoning control. */
export const kimiCodeReaderSummaryModel = "k3-256k" as const;
export const defaultOpenRouterReaderSummaryModel = "openai/gpt-oss-120b" as const;
/** Attested effort of a gateway task that sent no reasoning control. */
export const gatewayDefaultReasoningEffort = "default" as const;

export type GatewayReaderSummaryBackend =
  | typeof kimiCodeReaderSummaryBackend
  | typeof openRouterReaderSummaryBackend;

export type ReaderSummaryGenerationBackend =
  | typeof codexReaderSummaryBackend
  | typeof mimoReaderSummaryBackend
  | GatewayReaderSummaryBackend;

/** Model and reasoning policy of the one gateway route used by a run. */
export type GatewayReaderSummaryRoute = {
  readonly backend: GatewayReaderSummaryBackend;
  readonly model: string;
  /** gatewayDefaultReasoningEffort, or an effort the route sends explicitly. */
  readonly reasoningEffort: string;
};

const gatewayEfforts: ReadonlySet<string> = new Set(
  ["minimal", "low", "medium", "high", "xhigh", "max", "ultra"]);
const gatewayModelId = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;

export const isGatewayReaderSummaryBackend = (
  value: unknown,
): value is GatewayReaderSummaryBackend =>
  value === kimiCodeReaderSummaryBackend || value === openRouterReaderSummaryBackend;

/**
 * A model only the gateway runs. It never reuses the CLI model names, which
 * keep their own effort policy; gateway-only Codex models are included.
 */
export const isGatewayReaderSummaryModel = (value: unknown): value is string =>
  typeof value === "string" && gatewayModelId.test(value) &&
  value !== activeReaderSummaryModel && value !== mimoReaderSummaryModel;

export const isGatewayReaderSummaryReasoningEffort = (value: unknown): value is string =>
  value === gatewayDefaultReasoningEffort ||
  (typeof value === "string" && gatewayEfforts.has(value));

/**
 * Engine, model and effort of an attested execution whose model only the
 * gateway runs. A gateway-only Codex model keeps its allowed Codex effort.
 * Agreement across the tasks of one day is checked by the publication
 * verifiers.
 */
export const isGatewayReaderSummaryExecution = (attestation: {
  readonly runtimeEngine?: unknown;
  readonly model?: unknown;
  readonly reasoningEffort?: unknown;
}): boolean =>
  attestation.runtimeEngine === gatewayLlmRuntimeEngine &&
  isGatewayReaderSummaryModel(attestation.model) &&
  isGatewayReaderSummaryReasoningEffort(attestation.reasoningEffort) &&
  (!isCodexGatewayOnlyReaderSummaryModel(attestation.model) ||
    isCodexGatewayReaderSummaryRoute(attestation.model, attestation.reasoningEffort));

/**
 * The gateway route selected by AGENT_RUNTIME_READER_SUMMARY_BACKEND, or
 * undefined for a CLI backend. Kimi Code is pinned to its one model without
 * reasoning; OpenRouter takes any catalog model and an optional effort.
 */
export const resolveGatewayReaderSummaryRoute = (
  env: NodeJS.ProcessEnv,
): GatewayReaderSummaryRoute | undefined => {
  const backend = env.AGENT_RUNTIME_READER_SUMMARY_BACKEND?.trim();
  if (!isGatewayReaderSummaryBackend(backend)) return undefined;
  const model = env.AGENT_RUNTIME_GATEWAY_LLM_MODEL?.trim() || undefined;
  const effort = env.AGENT_RUNTIME_GATEWAY_LLM_REASONING_EFFORT?.trim() || undefined;
  if (backend === kimiCodeReaderSummaryBackend) {
    if (model !== undefined && model !== kimiCodeReaderSummaryModel) {
      throw new Error("AGENT_RUNTIME_GATEWAY_LLM_MODEL must be k3-256k for kimi-code");
    }
    if (effort !== undefined) {
      throw new Error("kimi-code rejects reasoning control; unset AGENT_RUNTIME_GATEWAY_LLM_REASONING_EFFORT");
    }
    return { backend, model: kimiCodeReaderSummaryModel,
      reasoningEffort: gatewayDefaultReasoningEffort };
  }
  const selected = model ?? defaultOpenRouterReaderSummaryModel;
  // Codex model names keep the Codex profile and their allowed efforts.
  if (!isGatewayReaderSummaryModel(selected) || isCodexGatewayOnlyReaderSummaryModel(selected)) {
    throw new Error("AGENT_RUNTIME_GATEWAY_LLM_MODEL is not a gateway model id");
  }
  if (effort !== undefined && !gatewayEfforts.has(effort)) {
    throw new Error("AGENT_RUNTIME_GATEWAY_LLM_REASONING_EFFORT is not a supported effort");
  }
  return { backend, model: selected,
    reasoningEffort: effort ?? gatewayDefaultReasoningEffort };
};

/** Purpose-specific model overrides must name the gateway model or stay unset. */
export const gatewayRouteModel = (
  route: { readonly model: string },
  purposeModel: string | undefined,
): string => {
  if (purposeModel !== undefined && purposeModel.trim() !== "" &&
    purposeModel.trim() !== route.model) {
    throw new Error("Gateway reader summary model conflicts with purpose policy");
  }
  return route.model;
};

