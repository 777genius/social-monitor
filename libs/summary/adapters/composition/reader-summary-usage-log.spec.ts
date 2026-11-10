import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentRuntimeClientPort, AgentRuntimeTaskCommand } from "../../ports";
import { withReaderSummaryUsageLog } from "./reader-summary-usage-log";
import { createSummaryAgentRuntimeClient } from "./reader-summary-agent-runtime-transport";

describe("reader summary usage log", () => {
  const directory = mkdtempSync(join(tmpdir(), "summary-usage-"));
  const evidence = join(directory, "evidence.json");
  const clock = { now: () => new Date("2026-11-10T00:00:00Z") };
  const command = { requestId: "request", purpose: "social_monitor.reader_summary.generate.v2",
    controls: { model: "gpt-6.1-terra", reasoningEffort: "medium" }, prompt: "private prompt" } as unknown as AgentRuntimeTaskCommand;
  afterAll(() => rmSync(directory, { recursive: true, force: true }));

  it("records reported tokens without prompt or output and records missing usage on failure", async () => {
    const client: AgentRuntimeClientPort = {
      checkHealth: jest.fn(),
      runTask: jest.fn().mockResolvedValueOnce({ status: "completed", warnings: [], outputText: "private output",
        usage: { inputTokens: 12, outputTokens: 4, totalTokens: 16, estimatedCostUsd: 0,
          cachedInputTokens: 7, reasoningTokens: 2 } })
        .mockRejectedValueOnce(new Error("private error")),
    };
    const wrapped = withReaderSummaryUsageLog(client, evidence, "run-1", clock);
    await wrapped.runTask(command);
    await expect(wrapped.runTask(command)).rejects.toThrow("private error");
    const text = readFileSync(`${evidence}.usage.jsonl`, "utf8");
    const records = text.trim().split("\n").map((line) => JSON.parse(line));
    expect(records[0]).toMatchObject({ runId: "run-1", model: "gpt-6.1-terra", effort: "medium",
      inputTokens: 12, outputTokens: 4, cachedInputTokens: 7, reasoningTokens: 2,
      usageSource: "runtime_reported", costUsd: null });
    expect(records[1]).toMatchObject({ status: "error", inputTokens: null, usageSource: "unavailable" });
    expect(text).not.toMatch(/private (prompt|output|error)/);
  });

  it("does not follow a symlink or change the model result on a log failure", async () => {
    const target = join(directory, "target");
    const source = join(directory, "symlink");
    writeFileSync(target, "original");
    symlinkSync(target, `${source}.usage.jsonl`);
    const stderr = jest.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const client = { runTask: jest.fn().mockResolvedValue({ status: "completed", warnings: [] }),
        checkHealth: jest.fn() } satisfies AgentRuntimeClientPort;
      await expect(withReaderSummaryUsageLog(client, source, "run-2", clock).runTask(command))
        .resolves.toMatchObject({ status: "completed" });
      expect(readFileSync(target, "utf8")).toBe("original");
    } finally { stderr.mockRestore(); }
  });

  it("records the target day through the production composition", async () => {
    const file = join(directory, "production-evidence.json");
    const raw = { runTask: jest.fn().mockResolvedValue({ status: "completed", warnings: [],
      usage: { inputTokens: 10, outputTokens: 3, totalTokens: 13, estimatedCostUsd: 0 } }),
      checkHealth: jest.fn() } satisfies AgentRuntimeClientPort;
    const client = createSummaryAgentRuntimeClient({ transport: "agent-runtime", runId: "prod-run",
      clock: { now: () => new Date("2026-11-10T00:00:00Z") }, agentRuntime: () => raw,
      env: { DURABLE_READER_SUMMARY_EVIDENCE_PATH: file,
        DURABLE_READER_SUMMARY_PERIOD_STARTED_AT: "2026-11-09T00:00:00Z" } });
    await client.runTask(command);
    expect(JSON.parse(readFileSync(`${file}.usage.jsonl`, "utf8"))).toMatchObject({
      targetDate: "2026-11-09", runId: "prod-run", inputTokens: 10, outputTokens: 3,
    });
  });

  it("preserves a completed result if formatting usage metadata fails", async () => {
    const brokenClock = { now: jest.fn().mockReturnValueOnce(new Date("2026-11-10T00:00:00Z"))
      .mockReturnValue(new Date("invalid")) };
    const client = { runTask: jest.fn().mockResolvedValue({ status: "completed", warnings: [] }),
      checkHealth: jest.fn() } satisfies AgentRuntimeClientPort;
    const stderr = jest.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      await expect(withReaderSummaryUsageLog(client, evidence, "run-3", brokenClock).runTask(command))
        .resolves.toMatchObject({ status: "completed" });
    } finally { stderr.mockRestore(); }
  });
});
