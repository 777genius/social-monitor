import type { AgentRuntimeTaskCommand, AgentRuntimeTaskResult } from "../../../ports";

/**
 * Gateway settlement diagnostics are not retry or attestation admission.
 * Preserve cleanup-before-grace ordering even when both conditions occur.
 */
export const gatewayLlmCompletionWarnings = (
  result: Readonly<{ cleanup: unknown }>,
  command: Readonly<Pick<AgentRuntimeTaskCommand, "timeoutMs">>,
  durationMs: number,
): AgentRuntimeTaskResult["warnings"] => [
  ...(result.cleanup === "pending" ? [{ code: "gateway_cleanup_pending",
    message: "Gateway execution close was not acknowledged" }] : []),
  ...(durationMs > command.timeoutMs ? [{ code: "gateway_settlement_grace_used",
    message: "Gateway task settled after its nominal timeout" }] : []),
];
