import type { AgentRuntimeTaskCommand, AgentRuntimeTaskResult } from "../../ports";
import {
  activeReaderSummaryPurposes,
  assertMimoReaderSummaryExecution,
} from "./active-reader-summary-generation-profile";

const command = {
  requestId: "synthetic-request",
  purpose: activeReaderSummaryPurposes.topicLabel,
  provider: "codex",
  controls: {
    model: "mimo-v2.6-pro",
    modelBackend: "xiaomi-mimo-token-plan",
    reasoningEffort: "high",
  },
} as unknown as AgentRuntimeTaskCommand;

describe("MiMo execution attestation boundary", () => {
  it("rejects a completed task without a verified execution attestation", () => {
    const result = {
      status: "completed",
      warnings: [],
      structuredOutput: { title: "synthetic" },
    } as AgentRuntimeTaskResult;
    expect(() => assertMimoReaderSummaryExecution({
      command, result, purpose: activeReaderSummaryPurposes.topicLabel,
    })).toThrow("Reader summary execution attestation is invalid");
  });

  it("rejects an unexpected task purpose before trusting the output", () => {
    const result = { status: "failed", warnings: [] } as AgentRuntimeTaskResult;
    expect(() => assertMimoReaderSummaryExecution({
      command, result, purpose: activeReaderSummaryPurposes.storyRelations,
    })).toThrow("Reader summary execution attestation is invalid");
  });
});
