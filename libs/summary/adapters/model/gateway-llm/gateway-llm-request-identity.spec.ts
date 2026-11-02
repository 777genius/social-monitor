import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import type { AgentRuntimeTaskCommand } from "../../../ports";
import { gatewayLlmCanonicalRequestSha256 } from "./gateway-llm-request-identity";

it("preserves the independently sealed canonical request and effective output floor", () => {
  const command: AgentRuntimeTaskCommand = { requestId: "TEST-request", correlationId: "TEST-correlation",
    tenantId: tenantId("00000000-0000-4000-8000-00000000e001"),
    workspaceId: workspaceId("00000000-0000-4000-8000-00000000e002"), timeoutMs: 1_000, purpose: "synthetic.purpose.v1", provider: "codex",
    systemPrompt: "Synthetic instructions", prompt: "Synthetic input", outputSchema: { type: "object" },
    controls: { maxOutputTokens: 6_000 } };
  const route = { profileId: "TEST-profile", model: "gpt-6.1-sol", reasoningEffort: "low" as const,
    minOutputTokens: 16_384 };
  // SHA256 of a separately serialized, lexicographically sorted fixture JSON.
  expect(gatewayLlmCanonicalRequestSha256(command, route)).toBe("5bbacf1db3a18ec4888033c8bbdfae3adae651a4ae223d55700ad7dfcb075449");
  expect(gatewayLlmCanonicalRequestSha256(command, { ...route, reasoningEffort: undefined }))
    .toBe("952ad1bf2642791355351162b1730f412b3fa89bc2d9809a57cea97f5fb9805a");
  for (const maxOutputTokens of [undefined, "20000", -1, 0, 1.5, Number.NaN]) {
    expect(gatewayLlmCanonicalRequestSha256({ ...command, controls: { maxOutputTokens } }, route))
      .toBe("5bbacf1db3a18ec4888033c8bbdfae3adae651a4ae223d55700ad7dfcb075449");
  }
  expect(gatewayLlmCanonicalRequestSha256({ ...command, controls: { maxOutputTokens: 20_000 } }, route))
    .not.toBe("5bbacf1db3a18ec4888033c8bbdfae3adae651a4ae223d55700ad7dfcb075449");
});
