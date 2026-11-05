import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import type { AgentRuntimeTaskCommand } from "../../../ports";
import { gatewayLlmCanonicalRequest, gatewayLlmCanonicalRequestSha256 } from "./gateway-llm-request-identity";

it("preserves the independently sealed canonical request and effective output floor", () => {
  const command: AgentRuntimeTaskCommand = { requestId: "TEST-request", correlationId: "TEST-correlation",
    tenantId: tenantId("00000000-0000-4000-8000-00000000e001"),
    workspaceId: workspaceId("00000000-0000-4000-8000-00000000e002"), timeoutMs: 1_000, purpose: "synthetic.purpose.v1", provider: "codex",
    systemPrompt: "Synthetic instructions", prompt: "Synthetic input", outputSchema: { type: "object" },
    controls: { maxOutputTokens: 6_000 } };
  const route = { profileId: "TEST-profile", model: "gpt-6.1-sol", reasoningEffort: "low" as const,
    minOutputTokens: 16_384 };
  // SHA256 of a separately serialized, lexicographically sorted fixture JSON, including 4 MiB SSE policy.
  expect(gatewayLlmCanonicalRequestSha256(command, route)).toBe("0367a4be718373d9101bb992323289a9cf8fa23c4653ff6d6afdbbbdfa41ab99");
  expect(gatewayLlmCanonicalRequestSha256(command, { ...route, reasoningEffort: undefined }))
    .toBe("2d2c890a0a92487821d3fae24905c7392a6e2371806e4556a525eb346bfcf4c4");
  for (const maxOutputTokens of [undefined, "20000", -1, 0, 1.5, Number.NaN]) {
    expect(gatewayLlmCanonicalRequestSha256({ ...command, controls: { maxOutputTokens } }, route))
      .toBe("0367a4be718373d9101bb992323289a9cf8fa23c4653ff6d6afdbbbdfa41ab99");
  }
  const writer = { ...command, purpose: "social_monitor.reader_summary.generate.v2" };
  expect(gatewayLlmCanonicalRequest(writer, route)).toMatchObject({ outputBytes: 8_388_608 });
  // Independent seals differ only in the effective 8 MiB versus 4 MiB transport policy.
  expect(gatewayLlmCanonicalRequestSha256(writer, route))
    .toBe("d238b08bf2477baa768b7049c2730d3b46c9e916daa5263d21a78f6ed7521659");
  expect(gatewayLlmCanonicalRequestSha256(writer, route))
    .not.toBe("6c7bf1da9f7789c792da15670f6a10d23040bc7cc9c22122b8de7df564183958");
  expect(gatewayLlmCanonicalRequestSha256({ ...command, controls: { maxOutputTokens: 20_000 } }, route))
    .not.toBe("0367a4be718373d9101bb992323289a9cf8fa23c4653ff6d6afdbbbdfa41ab99");
});
