import { gatewayLlmRuntimeEngine } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import {
  isCodexGatewayOnlyReaderSummaryModel,
  isCodexGatewayReaderSummaryRoute,
} from "./codex-reader-summary-route";
import {
  isGatewayReaderSummaryModel,
  isGatewayReaderSummaryReasoningEffort,
} from "./reader-summary-gateway-model-policy";

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

