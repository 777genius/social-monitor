import type { AgentRuntimeFailure } from "../../../ports";

/** Local failures before any gateway call; nothing was dispatched or paid. */
export const gatewayLlmLocalFailure = (
  code: "invalid_request" | "unsupported_route" | "invalid_schema",
  safeMessage: string,
): AgentRuntimeFailure => ({
  code,
  safeMessage,
  retryable: false,
  reconnectRequired: false,
  causeCategory: code === "invalid_schema" ? "output_schema" : "invalid_request",
  details: { gatewayEffect: "not_dispatched" },
});
