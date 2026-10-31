import type { AgentRuntimeClientPort } from "../../ports";
import {
  resolveReaderSummaryDailyTaskIdentityFromEnv,
  resolveReaderSummaryGenerationIdentityFromEnv,
  resolveReaderSummaryReasoningEffortFromEnv,
} from "../model/active-reader-summary-generation-profile";
import { GatewayLlmClient } from "../model/gateway-llm/gateway-llm-client";
import {
  assertReaderSummaryTransportBackend,
  createGatewayLlmAgentRuntimeClient,
  createReaderSummaryAgentRuntimeClient,
  resolveGatewayLlmTransportConfig,
} from "./reader-summary-agent-runtime-transport";

const kimiAccount = "43f64796-ec10-4a68-9256-6df3ac5183e4";
const gatewayEnv = (extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
  AGENT_RUNTIME_TRANSPORT: "gateway-llm",
  AGENT_RUNTIME_READER_SUMMARY_BACKEND: "kimi-code",
  AGENT_RUNTIME_GATEWAY_LLM_CONTROL_ORIGIN: "https://llm-gateway.sm.internal:8443",
  AGENT_RUNTIME_GATEWAY_LLM_INFERENCE_ORIGIN: "https://llm-gateway.sm.internal:8444",
  AGENT_RUNTIME_GATEWAY_LLM_CONTROL_TOKEN_FILE: "/run/llm-gateway/control-token",
  AGENT_RUNTIME_GATEWAY_LLM_ACCOUNT_REFS: ` ${kimiAccount}, ${kimiAccount} `,
  AGENT_RUNTIME_GATEWAY_LLM_POLICY_SUBJECT_REF: "social-monitor",
  AGENT_RUNTIME_GATEWAY_LLM_POLICY_REVISION: "1",
  AGENT_RUNTIME_GATEWAY_LLM_BINDING_REVISION: "0",
  // The Codex pins the daily runner keeps exporting must not leak into the route.
  AGENT_RUNTIME_READER_SUMMARY_MODEL: "gpt-5.6-sol",
  AGENT_RUNTIME_READER_SUMMARY_REASONING_EFFORT: "high",
  ...extra,
});
const clock = { now: () => new Date("2026-10-30T00:00:00.000Z") };

describe("reader summary agent-runtime transport", () => {
  it("resolves the Kimi route without reasoning and with room for thinking", () => {
    const env = gatewayEnv();
    expect(resolveGatewayLlmTransportConfig(env)).toEqual({
      controlOrigin: "https://llm-gateway.sm.internal:8443",
      inferenceOrigin: "https://llm-gateway.sm.internal:8444",
      controlTokenFile: "/run/llm-gateway/control-token",
      policy: { subjectRef: "social-monitor", policyRevision: 1, bindingRevision: 0 },
      route: { profileId: "kimi-code-global-responses-apikey-v1", modelBackend: "kimi-code",
        model: "k3-256k", accountRefs: [kimiAccount], minOutputTokens: 32_768 },
    });
    // Product identity and the transport route come from the same settings.
    expect(resolveReaderSummaryGenerationIdentityFromEnv(env)).toEqual({
      provider: "codex", model: "k3-256k", backend: "kimi-code" });
    expect(resolveReaderSummaryDailyTaskIdentityFromEnv(env, undefined)).toEqual({
      model: "k3-256k", modelBackend: "kimi-code" });
    expect(resolveReaderSummaryReasoningEffortFromEnv(env)).toBe("default");
  });

  it("resolves an OpenRouter catalog model with an explicit effort and profile", () => {
    const config = resolveGatewayLlmTransportConfig(gatewayEnv({
      AGENT_RUNTIME_READER_SUMMARY_BACKEND: "openrouter",
      AGENT_RUNTIME_GATEWAY_LLM_MODEL: "qwen/qwen3.6-plus",
      AGENT_RUNTIME_GATEWAY_LLM_REASONING_EFFORT: "medium",
      AGENT_RUNTIME_GATEWAY_LLM_PROFILE_ID: "openrouter-custom-v2",
      AGENT_RUNTIME_GATEWAY_LLM_MAX_OUTPUT_TOKENS: "8192",
    }));
    expect(config.route).toEqual({ profileId: "openrouter-custom-v2", modelBackend: "openrouter",
      model: "qwen/qwen3.6-plus", reasoningEffort: "medium", accountRefs: [kimiAccount],
      minOutputTokens: 8_192 });
    expect(resolveGatewayLlmTransportConfig(gatewayEnv({
      AGENT_RUNTIME_READER_SUMMARY_BACKEND: "openrouter" })).route)
      .toMatchObject({ profileId: "openrouter-openai-responses-apikey-v1",
        model: "openai/gpt-oss-120b" });
  });

  it("resolves Codex through the gateway with the identity the CLI path pins", () => {
    const codexAccount = "8d2f6a51-3c6e-4f0b-9d7a-2b1c4e5f6a7b";
    const env = gatewayEnv({ AGENT_RUNTIME_READER_SUMMARY_BACKEND: "openai-chatgpt",
      AGENT_RUNTIME_GATEWAY_LLM_ACCOUNT_REFS: `${codexAccount},${kimiAccount}` });
    expect(resolveGatewayLlmTransportConfig(env).route).toEqual({
      profileId: "openai-codex-oauth-responses-v1", modelBackend: "openai-chatgpt", model: "gpt-5.6-sol",
      reasoningEffort: "high", accountRefs: [codexAccount, kimiAccount], minOutputTokens: 16_384 });
    // Adapters keep the Codex identity, so verifiers check gpt-5.6-sol at effort high.
    expect(resolveReaderSummaryGenerationIdentityFromEnv(env)).toEqual({
      provider: "codex", model: "gpt-5.6-sol", backend: "openai-chatgpt" });
    expect(resolveReaderSummaryDailyTaskIdentityFromEnv(env, undefined)).toEqual({
      model: "gpt-5.6-sol", modelBackend: "openai-chatgpt" });
    expect(resolveReaderSummaryReasoningEffortFromEnv(env)).toBe("high");
    expect(resolveGatewayLlmTransportConfig(gatewayEnv({ AGENT_RUNTIME_READER_SUMMARY_BACKEND: "openai-chatgpt",
      AGENT_RUNTIME_GATEWAY_LLM_MODEL: "gpt-5.6-sol", AGENT_RUNTIME_GATEWAY_LLM_REASONING_EFFORT: "high",
      AGENT_RUNTIME_GATEWAY_LLM_MAX_OUTPUT_TOKENS: "24000" })).route)
      .toMatchObject({ model: "gpt-5.6-sol", reasoningEffort: "high", minOutputTokens: 24_000 });
  });

  it.each([
    ["another Codex gateway model", { AGENT_RUNTIME_GATEWAY_LLM_MODEL: "gpt-5.6-mini" }],
    ["another Codex gateway effort", { AGENT_RUNTIME_GATEWAY_LLM_REASONING_EFFORT: "medium" }],
    ["an effort the Codex purposes do not admit", { AGENT_RUNTIME_READER_SUMMARY_REASONING_EFFORT: "xhigh" }],
  ])("rejects %s for openai-chatgpt", (_name, extra) => {
    expect(() => resolveGatewayLlmTransportConfig(gatewayEnv({
      AGENT_RUNTIME_READER_SUMMARY_BACKEND: "openai-chatgpt", ...extra }))).toThrow();
  });

  it.each([
    ["a Kimi model override", { AGENT_RUNTIME_GATEWAY_LLM_MODEL: "kimi-k2" }],
    ["Kimi reasoning", { AGENT_RUNTIME_GATEWAY_LLM_REASONING_EFFORT: "high" }],
    ["a CLI model on OpenRouter", { AGENT_RUNTIME_READER_SUMMARY_BACKEND: "openrouter",
      AGENT_RUNTIME_GATEWAY_LLM_MODEL: "gpt-5.6-sol" }],
    ["missing account refs", { AGENT_RUNTIME_GATEWAY_LLM_ACCOUNT_REFS: " " }],
    ["a malformed account ref", { AGENT_RUNTIME_GATEWAY_LLM_ACCOUNT_REFS: "account:1" }],
    ["a missing token file", { AGENT_RUNTIME_GATEWAY_LLM_CONTROL_TOKEN_FILE: "" }],
    ["a negative revision", { AGENT_RUNTIME_GATEWAY_LLM_POLICY_REVISION: "-1" }],
    ["tokens above the profile cap", { AGENT_RUNTIME_GATEWAY_LLM_MAX_OUTPUT_TOKENS: "65537" }],
    ["the MiMo CLI backend", { AGENT_RUNTIME_READER_SUMMARY_BACKEND: "xiaomi-mimo-token-plan" }],
    ["no explicit backend", { AGENT_RUNTIME_READER_SUMMARY_BACKEND: "" }],
  ])("rejects %s", (_name, extra) => {
    expect(() => resolveGatewayLlmTransportConfig(gatewayEnv(extra))).toThrow();
  });

  it("rejects purpose models that disagree with the gateway route", () => {
    expect(() => resolveReaderSummaryGenerationIdentityFromEnv(gatewayEnv({
      AGENT_RUNTIME_READER_SUMMARY_GENERATION_MODEL: "gpt-5.6-sol" }))).toThrow();
    expect(() => resolveReaderSummaryDailyTaskIdentityFromEnv(gatewayEnv(), "mimo-v2.6-pro"))
      .toThrow();
  });

  it("fails at startup on a half-switched transport", () => {
    const agentRuntime = jest.fn((): AgentRuntimeClientPort => ({
      runTask: jest.fn(), checkHealth: jest.fn() }));
    const params = { clock, runId: "run-1", agentRuntime };
    expect(() => createReaderSummaryAgentRuntimeClient({ ...params, transport: "agent-runtime",
      env: gatewayEnv() })).toThrow("require AGENT_RUNTIME_TRANSPORT=gateway-llm");
    expect(() => createReaderSummaryAgentRuntimeClient({ ...params, transport: "gateway-llm",
      env: gatewayEnv({ AGENT_RUNTIME_READER_SUMMARY_BACKEND: "xiaomi-mimo-token-plan" }) }))
      .toThrow("serves only");
    expect(createReaderSummaryAgentRuntimeClient({ ...params, transport: "agent-runtime",
      env: {} })).toBe(agentRuntime.mock.results[0]!.value);
    expect(agentRuntime).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["gateway-llm", "openai-chatgpt", true], ["gateway-llm", "kimi-code", true], ["gateway-llm", "openrouter", true],
    ["gateway-llm", undefined, false], ["gateway-llm", "xiaomi-mimo-token-plan", false],
    ["agent-runtime", "openai-chatgpt", true], ["agent-runtime", undefined, true],
    ["agent-runtime", "xiaomi-mimo-token-plan", true],
    ["agent-runtime", "kimi-code", false], ["agent-runtime", "openrouter", false],
  ] as const)("pairs transport %s with backend %s: %s", (transport, backend, allowed) => {
    const check = () => assertReaderSummaryTransportBackend(transport,
      backend === undefined ? {} : { AGENT_RUNTIME_READER_SUMMARY_BACKEND: backend });
    if (allowed) expect(check).not.toThrow();
    else expect(check).toThrow(/AGENT_RUNTIME_TRANSPORT=gateway-llm/u);
  });

  it("builds the gateway client from the token file and refuses an empty token", () => {
    const config = resolveGatewayLlmTransportConfig(gatewayEnv());
    const read = jest.fn(() => "fixture-control-token\n");
    expect(createGatewayLlmAgentRuntimeClient(config, { clock, runId: "run-1",
      readControlToken: read })).toBeInstanceOf(GatewayLlmClient);
    expect(read).toHaveBeenCalledWith("/run/llm-gateway/control-token");
    expect(() => createGatewayLlmAgentRuntimeClient(config, { clock, runId: "run-1",
      readControlToken: () => "\n" })).toThrow("token file is empty");
    expect(() => createGatewayLlmAgentRuntimeClient({ ...config,
      controlOrigin: "http://llm-gateway.sm.internal:8443" }, { clock, runId: "run-1",
      readControlToken: read })).toThrow("bare https origins");
  });
});
