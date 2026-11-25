import type { AgentRuntimeClientPort } from "../../ports";
import {
  AgentRuntimeReaderSummaryStoryRelationVerifier,
  resolveAgentRuntimeReaderSummaryStoryRelationVerifierOptions as legacyResolver,
} from "./agent-runtime-reader-summary-story-relation-verifier.adapter";
import {
  resolveAgentRuntimeReaderSummaryStoryRelationVerifierOptions,
  resolveStoryRelationVerifierConfig,
} from "./agent-runtime-reader-summary-story-relation-options";

const client = {} as AgentRuntimeClientPort;

describe("story relation verifier configuration boundary", () => {
  it("preserves the legacy resolver's exact exported identity", () => {
    expect(legacyResolver).toBe(resolveAgentRuntimeReaderSummaryStoryRelationVerifierOptions);
  });

  it("keeps the original default task identities, prompts and bounded limits", () => {
    const config = resolveStoryRelationVerifierConfig({ client });
    expect(config).toMatchObject({
      provider: "codex",
      modelBackend: "openai-chatgpt",
      promptVersion: "reader_summary.story_relation.agent_runtime.v3",
      relatedTopicPromptVersion: "reader_summary.related_topic_relation.agent_runtime.v1",
      timeoutMs: 300_000,
      relatedTopicTimeoutMs: 15_000,
      maxOutputTokens: 6_000,
    });
    expect(() => new AgentRuntimeReaderSummaryStoryRelationVerifier({ client })).not.toThrow();
  });

  it("preserves positive overrides while rejecting invalid limit overrides", () => {
    expect(resolveStoryRelationVerifierConfig({
      client,
      promptVersion: " custom.primary ",
      relatedTopicPromptVersion: " custom.related ",
      timeoutMs: 9_000,
      relatedTopicTimeoutMs: 6_000,
      maxOutputTokens: 2_000,
    })).toMatchObject({
      promptVersion: "custom.primary",
      relatedTopicPromptVersion: "custom.related",
      timeoutMs: 9_000,
      relatedTopicTimeoutMs: 6_000,
      maxOutputTokens: 2_000,
    });
    expect(resolveStoryRelationVerifierConfig({
      client,
      timeoutMs: 0,
      relatedTopicTimeoutMs: -1,
      maxOutputTokens: Number.NaN,
    })).toMatchObject({
      timeoutMs: 300_000,
      relatedTopicTimeoutMs: 15_000,
      maxOutputTokens: 6_000,
    });
  });

  it("keeps independent lane timeout precedence and rejects nonpositive env values", () => {
    const env = {
      AGENT_RUNTIME_PROVIDER: "codex",
      AGENT_RUNTIME_TIMEOUT_MS: "90000",
      AGENT_RUNTIME_READER_SUMMARY_MODEL_TIMEOUT_MS: "45000",
      AGENT_RUNTIME_READER_SUMMARY_RELATED_TOPIC_VERIFIER_TIMEOUT_MS: "7000",
      AGENT_RUNTIME_READER_SUMMARY_STORY_RELATION_VERIFIER_MAX_OUTPUT_TOKENS: "2200",
    };
    expect(resolveAgentRuntimeReaderSummaryStoryRelationVerifierOptions(env, client))
      .toMatchObject({
        timeoutMs: 45_000,
        relatedTopicTimeoutMs: 7_000,
        maxOutputTokens: 2_200,
      });
    expect(resolveAgentRuntimeReaderSummaryStoryRelationVerifierOptions({
      ...env,
      AGENT_RUNTIME_READER_SUMMARY_STORY_RELATION_VERIFIER_TIMEOUT_MS: "15000",
    }, client)).toMatchObject({ timeoutMs: 15_000 });
    expect(resolveAgentRuntimeReaderSummaryStoryRelationVerifierOptions({
      ...env,
      AGENT_RUNTIME_READER_SUMMARY_STORY_RELATION_VERIFIER_TIMEOUT_MS: "0",
      AGENT_RUNTIME_READER_SUMMARY_RELATED_TOPIC_VERIFIER_TIMEOUT_MS: "-3",
    }, client)).toMatchObject({ timeoutMs: undefined, relatedTopicTimeoutMs: undefined });
  });
});
