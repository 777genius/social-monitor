import type { AgentRuntimeTaskCommand, AgentRuntimeTaskResult } from "../../ports";
import {
  activeReaderSummaryPurposes,
  assertMimoReaderSummaryExecution,
  verifyAndRecordMimoDailyExecution,
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
  it("never records failed or unattested output, including a valid task role", async () => {
    const sink = { record: jest.fn() };
    await expect(verifyAndRecordMimoDailyExecution({
      command,
      result: { status: "failed", warnings: [] } as AgentRuntimeTaskResult,
      taskRole: "topic_label",
      attempt: "synthetic-1",
      normalizedOutput: { title: "synthetic" },
      sink,
    })).rejects.toThrow("Reader summary execution attestation is invalid");
    expect(sink.record).not.toHaveBeenCalled();
  });

  it("rejects an unknown runtime task role before reaching the attestation sink", async () => {
    const sink = { record: jest.fn() };
    await expect(verifyAndRecordMimoDailyExecution({
      command,
      result: { status: "completed", warnings: [] } as AgentRuntimeTaskResult,
      taskRole: "unknown_role" as Parameters<typeof verifyAndRecordMimoDailyExecution>[0]["taskRole"],
      attempt: "synthetic-2",
      normalizedOutput: {},
      sink,
    })).rejects.toThrow("Reader summary execution attestation is invalid");
    expect(sink.record).not.toHaveBeenCalled();
  });

});
