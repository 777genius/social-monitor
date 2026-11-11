import { activeReaderSummaryModel } from "./active-reader-summary-generation-profile";
import {
  resolveTopicRelationVerifierConfig,
  topicRelationVerifierDefaultTimeoutMs,
} from "./agent-runtime-reader-summary-topic-relation-options";
import { defaultTimeoutMs } from "./agent-runtime-reader-summary-topic-relation-verifier.adapter";

describe("topic relation verifier dispatch configuration", () => {
  it("keeps the canonical model, purpose prompt, and public timeout default", () => {
    const config = resolveTopicRelationVerifierConfig({});
    expect(config).toMatchObject({
      provider: "codex",
      model: activeReaderSummaryModel,
      modelBackend: "openai-chatgpt",
      promptVersion: "reader_summary.topic_relation.agent_runtime.v3",
      timeoutMs: 300_000,
      maxOutputTokens: 4_000,
    });
    expect(config.reasoningEffort).toBeTruthy();
    expect(defaultTimeoutMs).toBe(topicRelationVerifierDefaultTimeoutMs);
  });

  it("normalizes invalid numeric overrides without changing dispatch defaults", () => {
    expect(resolveTopicRelationVerifierConfig({
      promptVersion: "   ",
      timeoutMs: 0,
      maxOutputTokens: Number.NaN,
    })).toMatchObject({
      promptVersion: "reader_summary.topic_relation.agent_runtime.v3",
      timeoutMs: 300_000,
      maxOutputTokens: 4_000,
    });
    expect(resolveTopicRelationVerifierConfig({
      promptVersion: " custom.prompt.v1 ",
      timeoutMs: 12_000,
      maxOutputTokens: 128,
    })).toMatchObject({
      promptVersion: "custom.prompt.v1",
      timeoutMs: 12_000,
      maxOutputTokens: 128,
    });
  });

  it("rejects incompatible provider-model backend identity before dispatch", () => {
    expect(() => resolveTopicRelationVerifierConfig({
      modelBackend: "xiaomi-mimo-token-plan",
      model: "gpt-5.6-sol",
    })).toThrow();
  });
});
