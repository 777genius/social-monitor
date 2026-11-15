import { activeReaderSummaryModel } from "./codex-reader-summary-route";
import { mimoReaderSummaryModel } from "./reader-summary-runtime-contract";

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


// Only route admission imports the explicit-effort set; "default" is attestation-only.
export { gatewayEfforts };
