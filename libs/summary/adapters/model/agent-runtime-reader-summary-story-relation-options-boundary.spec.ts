import type { AgentRuntimeClientPort } from "../../ports";
import {
  resolveStoryRelationVerifierConfig as legacyConfig,
  resolveAgentRuntimeReaderSummaryStoryRelationVerifierOptions as legacyEnv,
} from "./agent-runtime-reader-summary-story-relation-options";
import { resolveStoryRelationVerifierConfig } from "./agent-runtime-reader-summary-story-relation-config";
import { resolveAgentRuntimeReaderSummaryStoryRelationVerifierOptions } from "./agent-runtime-reader-summary-story-relation-env-options";
import {
  resolveAgentRuntimeReaderSummaryStoryRelationVerifierOptions as publicVerifierOptions,
} from "./agent-runtime-reader-summary-story-relation-verifier.adapter";

describe("story relation verifier configuration boundaries", () => {
  const client = {} as AgentRuntimeClientPort;

  it("preserves legacy function identities and pure bounded defaults", () => {
    expect(legacyConfig).toBe(resolveStoryRelationVerifierConfig);
    expect(legacyEnv).toBe(resolveAgentRuntimeReaderSummaryStoryRelationVerifierOptions);
    expect(publicVerifierOptions).toBe(resolveAgentRuntimeReaderSummaryStoryRelationVerifierOptions);

    const options = Object.freeze({
      client,
      timeoutMs: 0,
      relatedTopicTimeoutMs: -1,
      maxOutputTokens: 0,
    });
    const before = JSON.stringify(options);
    expect(resolveStoryRelationVerifierConfig(options)).toMatchObject({
      provider: "codex",
      timeoutMs: 300_000,
      relatedTopicTimeoutMs: 15_000,
      maxOutputTokens: 6_000,
      promptVersion: "reader_summary.story_relation.agent_runtime.v3",
      relatedTopicPromptVersion: "reader_summary.related_topic_relation.agent_runtime.v1",
    });
    expect(JSON.stringify(options)).toBe(before);
  });

  it("projects frozen caller-supplied env once with verifier-specific precedence", () => {
    const env = Object.freeze({
      AGENT_RUNTIME_READER_SUMMARY_STORY_RELATION_VERIFIER_TIMEOUT_MS: "9000",
      AGENT_RUNTIME_READER_SUMMARY_MODEL_TIMEOUT_MS: "12345",
      AGENT_RUNTIME_TIMEOUT_MS: "40000",
      AGENT_RUNTIME_READER_SUMMARY_RELATED_TOPIC_VERIFIER_TIMEOUT_MS: "4500",
      AGENT_RUNTIME_READER_SUMMARY_STORY_RELATION_VERIFIER_MAX_OUTPUT_TOKENS: "2900",
      AGENT_RUNTIME_READER_SUMMARY_STORY_RELATION_VERIFIER_PROMPT_VERSION: "synthetic-binary-release",
      AGENT_RUNTIME_READER_SUMMARY_RELATED_TOPIC_VERIFIER_PROMPT_VERSION: "synthetic-related-release",
    });
    const before = JSON.stringify(env);
    const options = resolveAgentRuntimeReaderSummaryStoryRelationVerifierOptions(env, client);
    expect(options).toMatchObject({
      client,
      timeoutMs: 9000,
      relatedTopicTimeoutMs: 4500,
      maxOutputTokens: 2900,
      promptVersion: "synthetic-binary-release",
      relatedTopicPromptVersion: "synthetic-related-release",
    });
    expect(resolveStoryRelationVerifierConfig(options)).toMatchObject({
      timeoutMs: 9000,
      relatedTopicTimeoutMs: 4500,
      maxOutputTokens: 2900,
      promptVersion: "synthetic-binary-release",
      relatedTopicPromptVersion: "synthetic-related-release",
    });
    expect(JSON.stringify(env)).toBe(before);
  });
});
