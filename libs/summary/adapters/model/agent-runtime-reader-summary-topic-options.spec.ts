import type { AgentRuntimeClientPort } from "../../ports";
import {
  resolveAgentRuntimeReaderSummaryTopicLabelerOptions as legacyLabeler,
} from "./agent-runtime-reader-summary-topic-labeler.adapter";
import {
  resolveAgentRuntimeReaderSummaryTopicRelationVerifierOptions as legacyRelation,
} from "./agent-runtime-reader-summary-topic-relation-verifier.adapter";
import {
  resolveAgentRuntimeReaderSummaryTopicLabelerOptions,
} from "./agent-runtime-reader-summary-topic-labeler-options";
import {
  resolveAgentRuntimeReaderSummaryTopicRelationVerifierOptions,
} from "./agent-runtime-reader-summary-topic-relation-options";

const client = {} as AgentRuntimeClientPort;

describe("agent-runtime topic verifier environment boundaries", () => {
  it("preserves the public resolver identities", () => {
    expect(legacyLabeler).toBe(resolveAgentRuntimeReaderSummaryTopicLabelerOptions);
    expect(legacyRelation).toBe(resolveAgentRuntimeReaderSummaryTopicRelationVerifierOptions);
  });

  it("resolves bounded labeler task settings from environment without executing a task", () => {
    const options = resolveAgentRuntimeReaderSummaryTopicLabelerOptions({
      AGENT_RUNTIME_PROVIDER: "codex",
      AGENT_RUNTIME_READER_SUMMARY_TOPIC_LABELER_TIMEOUT_MS: "16543",
      AGENT_RUNTIME_READER_SUMMARY_TOPIC_LABELER_MAX_OUTPUT_TOKENS: "2451",
      AGENT_RUNTIME_READER_SUMMARY_TOPIC_LABELER_MAX_CANDIDATES: "17",
    }, client);
    expect(options).toMatchObject({
      client,
      timeoutMs: 16543,
      maxOutputTokens: 2451,
      maxCandidates: 17,
    });
  });

  it("honors relation-specific timeout precedence, then labeler timeout fallback", () => {
    const env = {
      AGENT_RUNTIME_PROVIDER: "codex",
      AGENT_RUNTIME_READER_SUMMARY_TOPIC_LABELER_TIMEOUT_MS: "23000",
      AGENT_RUNTIME_READER_SUMMARY_TOPIC_RELATION_VERIFIER_MAX_OUTPUT_TOKENS: "3501",
    };
    expect(resolveAgentRuntimeReaderSummaryTopicRelationVerifierOptions(env, client))
      .toMatchObject({ timeoutMs: 23000, maxOutputTokens: 3501 });
    expect(resolveAgentRuntimeReaderSummaryTopicRelationVerifierOptions({
      ...env,
      AGENT_RUNTIME_READER_SUMMARY_TOPIC_RELATION_VERIFIER_TIMEOUT_MS: "8100",
    }, client)).toMatchObject({ timeoutMs: 8100 });
  });

  it("keeps non-positive numeric options fail-closed to resolver defaults", () => {
    const options = resolveAgentRuntimeReaderSummaryTopicLabelerOptions({
      AGENT_RUNTIME_PROVIDER: "codex",
      AGENT_RUNTIME_READER_SUMMARY_TOPIC_LABELER_TIMEOUT_MS: "0",
      AGENT_RUNTIME_READER_SUMMARY_TOPIC_LABELER_MAX_OUTPUT_TOKENS: "-1",
    }, client);
    expect(options.timeoutMs).toBeUndefined();
    expect(options.maxOutputTokens).toBeUndefined();
  });
});
