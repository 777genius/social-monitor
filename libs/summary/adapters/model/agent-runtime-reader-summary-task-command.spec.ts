import { readerSummaryInput } from "./agent-runtime-reader-summary-model.spec-support";
import {
  codexReaderSummaryBackend,
} from "./active-reader-summary-generation-profile";
import { buildAgentRuntimeReaderSummaryTaskCommand } from "./agent-runtime-reader-summary-task-command";

const makeParams = () => ({
  input: readerSummaryInput(),
  selectedRoute: {
    provider: "agent-runtime",
    model: "codex:gpt-5.6-sol:high",
    promptVersion: "reader_summary.prompt.test",
    schemaVersion: "reader_summary.artifact.v1",
  } as const,
  attempt: "primary" as const,
  agentProvider: "codex" as const,
  legacyRecovery: false,
  modelBackend: codexReaderSummaryBackend,
  reasoningEffort: "high",
  model: "gpt-5.6-sol",
  maxOutputTokens: 16_000,
  timeoutMs: 600_000,
});

describe("Agent Runtime reader-summary task command", () => {
  it("preserves tenant and workspace identity and the fail-closed no-tools request", () => {
    const task = buildAgentRuntimeReaderSummaryTaskCommand(makeParams());
    expect(task.tenantId).toBe(makeParams().input.tenantId);
    expect(task.workspaceId).toBe(makeParams().input.workspaceId);
    expect(task.requestId).not.toBe(task.correlationId);
    expect(task.provider).toBe("codex");
    expect(task.purpose).toBe("social_monitor.reader_summary.generate.v2");
    expect(task.controls).toMatchObject({
      model: "gpt-5.6-sol",
      reasoningEffort: "high",
      toolsEnabled: false,
      toolPolicy: "none",
      maxOutputTokens: 16_000,
    });
    expect(task.timeoutMs).toBe(600_000);
    expect(task.metadata).toMatchObject({
      attempt: "primary",
      promptVersion: "reader_summary.prompt.test",
      reasoningEffort: "high",
    });
  });

  it("builds repair on the same tenant and workspace with a repair purpose", () => {
    const params = makeParams();
    const primary = buildAgentRuntimeReaderSummaryTaskCommand(params);
    const repair = buildAgentRuntimeReaderSummaryTaskCommand({ ...params, attempt: "repair" });
    expect(repair.tenantId).toBe(primary.tenantId);
    expect(repair.workspaceId).toBe(primary.workspaceId);
    expect(repair.purpose).toBe("social_monitor.reader_summary.repair.v2");
    expect(repair.metadata).toMatchObject({ attempt: "repair" });
    expect(repair.requestId).not.toBe(primary.requestId);
  });
});
