import type { AgentRuntimeClientPort } from "../../ports";
import {
  defaultTimeoutMs,
  resolveAgentRuntimeTopicLabelerSettings,
} from "./agent-runtime-reader-summary-topic-labeler-runtime-settings";

const syntheticClient = {} as AgentRuntimeClientPort;

describe("Agent Runtime topic labeler dispatch settings", () => {
  it("preserves canonical prompt, timeout and bounded candidate defaults", () => {
    const settings = resolveAgentRuntimeTopicLabelerSettings({
      client: syntheticClient,
    });
    expect(settings).toMatchObject({
      agentProvider: "codex",
      modelBackend: "openai-chatgpt",
      promptVersion: "reader_summary.topic_map.agent_runtime.v21",
      timeoutMs: defaultTimeoutMs,
      maxOutputTokens: 6_000,
      maxCandidates: 18,
    });
  });

  it("coerces invalid optional limits to the same safe defaults", () => {
    const settings = resolveAgentRuntimeTopicLabelerSettings({
      client: syntheticClient,
      promptVersion: "   ",
      timeoutMs: -1,
      maxOutputTokens: 0,
      maxCandidates: Number.NaN,
    });
    expect(settings.promptVersion).toBe("reader_summary.topic_map.agent_runtime.v21");
    expect(settings.timeoutMs).toBe(600_000);
    expect(settings.maxOutputTokens).toBe(6_000);
    expect(settings.maxCandidates).toBe(18);
  });

  it("keeps explicit bounded options and never permits more published nodes", () => {
    const settings = resolveAgentRuntimeTopicLabelerSettings({
      client: syntheticClient,
      providerInstanceId: "isolated-test",
      promptVersion: " test-topic-labeler ",
      timeoutMs: 1_200,
      maxOutputTokens: 3_000,
      maxCandidates: 2,
    });
    expect(settings).toMatchObject({
      providerInstanceId: "isolated-test",
      promptVersion: "test-topic-labeler",
      timeoutMs: 1_200,
      maxOutputTokens: 3_000,
      maxCandidates: 2,
    });
    expect(resolveAgentRuntimeTopicLabelerSettings({
      client: syntheticClient,
      maxCandidates: 100,
    }).maxCandidates).toBe(18);
  });

  it("fails closed on a model incompatible with the selected backend", () => {
    expect(() => resolveAgentRuntimeTopicLabelerSettings({
      client: syntheticClient,
      modelBackend: "xiaomi-mimo-token-plan",
      model: "gpt-5.6-sol",
    })).toThrow();
  });
});
