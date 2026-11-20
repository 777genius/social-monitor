import { gatewayLlmCompletionWarnings } from "./gateway-llm-settlement-warnings";

describe("gateway LLM settled completion diagnostics", () => {
  const command = Object.freeze({ timeoutMs: 1_000 });

  it.each([
    { cleanup: "closed", durationMs: 1_000, codes: [] },
    { cleanup: "pending", durationMs: 1_000, codes: ["gateway_cleanup_pending"] },
    { cleanup: "closed", durationMs: 1_001, codes: ["gateway_settlement_grace_used"] },
    { cleanup: "pending", durationMs: 1_001,
      codes: ["gateway_cleanup_pending", "gateway_settlement_grace_used"] },
  ])("preserves ordered warnings for $cleanup and $durationMs", ({ cleanup, durationMs, codes }) => {
    const result = Object.freeze({ cleanup });
    const warnings = gatewayLlmCompletionWarnings(result, command, durationMs);
    expect(warnings?.map((warning) => warning.code)).toEqual(codes);
    expect(warnings).toEqual(codes.map((code) => ({
      code,
      message: code === "gateway_cleanup_pending"
        ? "Gateway execution close was not acknowledged"
        : "Gateway task settled after its nominal timeout",
    })));
    expect(command.timeoutMs).toBe(1_000);
    expect(result.cleanup).toBe(cleanup);
  });
});
