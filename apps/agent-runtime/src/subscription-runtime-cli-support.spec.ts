import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
jest.mock("node:child_process", () => ({ spawn: jest.fn() }));
import { cliExecutionResult, parseSubscriptionRuntimeCliResult, runCli } from "./subscription-runtime-cli-support";

describe("subscription-runtime CLI result telemetry", () => {
  it("reads exact usage and duration from protocol telemetry only", () => {
    const result = parseSubscriptionRuntimeCliResult(JSON.stringify({
      status: "completed",
      structuredOutput: {},
      warnings: [],
      usage: { inputTokens: 999, outputTokens: 1, totalTokens: 1_000 },
      telemetry: {
        usage: { inputTokens: 12, outputTokens: 5, totalTokens: 17 },
        durationMs: 25,
      },
    }));

    expect(result).toMatchObject({
      usage: { inputTokens: 12, outputTokens: 5, totalTokens: 17 },
      durationMs: 25,
    });
  });

  it.each([
    ["inconsistent total", { inputTokens: 12, outputTokens: 5, totalTokens: 99 }],
    ["negative", { inputTokens: -1, outputTokens: 5, totalTokens: 4 }],
    ["unsafe", {
      inputTokens: Number.MAX_SAFE_INTEGER + 1,
      outputTokens: 0,
      totalTokens: Number.MAX_SAFE_INTEGER + 1,
    }],
  ])("drops %s usage without dropping duration", (_label, usage) => {
    const result = parseSubscriptionRuntimeCliResult(JSON.stringify({
      status: "completed",
      structuredOutput: {},
      warnings: [],
      telemetry: { usage, durationMs: 25 },
    }));

    expect(result.usage).toBeUndefined();
    expect(result.durationMs).toBe(25);
  });

  it("keeps unrelated results valid when telemetry is absent", () => {
    expect(parseSubscriptionRuntimeCliResult(JSON.stringify({
      status: "completed",
      structuredOutput: {},
      warnings: [],
    }))).toMatchObject({ status: "completed" });
  });
});

// A parseable intermediate print is not proof of successful process completion.
describe("subscription CLI terminal process receipt", () => {
  it.each([
    { exitCode: 1, signal: null, timedOut: false },
    { exitCode: null, signal: "SIGTERM" as const, timedOut: false },
    { exitCode: 0, signal: null, timedOut: true },
  ])("rejects successful JSON from unsuccessful termination %j", (termination) => {
    expect(cliExecutionResult({ ...termination, stderr: "", stdout: JSON.stringify({
      status: "completed", structuredOutput: { reviews: [] }, warnings: [],
    }) }).status).toBe("failed");
  });
  it("accepts successful JSON after clean exit", () => {
    expect(cliExecutionResult({ exitCode: 0, signal: null, timedOut: false, stderr: "",
      stdout: JSON.stringify({ status: "completed", structuredOutput: {}, warnings: [] }),
    }).status).toBe("completed");
  });
});

describe("subscription CLI safe failure diagnostic values", () => {
  it.each([
    ["capacityReason", "quota_recheck_identity_changed"],
    ["capacityReason", "quota_recheck_inconclusive"],
    ["capacityReason", "quota_recheck_failed"],
    ["capacityReason", "rate_limit_threshold"],
    ["capacityReason", "quota_limited"],
    ["capacityReason", "account_exhausted"],
    ["safeExecutorStatus", "waiting_capacity"],
    ["safeExecutorStatus", "partial"],
    ["safeExecutorStatus", "failed"],
    ["safeExecutorStatus", "aborted"],
  ])("preserves recognized %s=%s separately from classification", (key, value) => {
    const details = { reason: "account_unavailable", [key]: value };
    const result = parseSubscriptionRuntimeCliResult(JSON.stringify({
      status: "failed", warnings: [], failure: {
        code: "unknown_runtime_failure", details,
      },
    }));
    expect(result.failure?.details).toEqual(details);
    expect(result.failure?.code).toBe("provider_session_invalid");
  });
});


describe("assessment spawn budget and incremental transport", () => {
  const child = () => Object.assign(new EventEmitter(), {
    stdout: Object.assign(new EventEmitter(), { destroy: jest.fn() }),
    stderr: Object.assign(new EventEmitter(), { destroy: jest.fn() }),
    kill: jest.fn(() => true), unref: jest.fn(),
  });
  beforeEach(() => { jest.useFakeTimers({ now: 1_000_000 }); jest.clearAllMocks(); });
  afterEach(() => jest.useRealTimers());

  it("counts synchronous spawn startup against the same early and hard deadlines", async () => {
    const process = child();
    jest.mocked(spawn).mockImplementation(() => {
      jest.advanceTimersByTime(10_000);
      return process as unknown as ReturnType<typeof spawn>;
    });
    const result = runCli({ command: "/synthetic", args: [], timeoutMs: 60_000,
      env: { SOCIAL_MONITOR_ASSESSMENT_DEADLINE_MS: "9999999999" }, assessment: { onProgress: jest.fn() } });
    expect(jest.mocked(spawn).mock.calls[0]?.[2]).toMatchObject({ env: { SOCIAL_MONITOR_ASSESSMENT_DEADLINE_MS: "1060000" } });
    await jest.advanceTimersByTimeAsync(29_999); expect(process.kill).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1); expect(process.kill.mock.calls).toEqual([["SIGTERM"]]);
    await jest.advanceTimersByTimeAsync(20_000); expect(process.kill.mock.calls).toEqual([["SIGTERM"], ["SIGTERM"]]);
    await jest.advanceTimersByTimeAsync(1000);
    expect(await result).toMatchObject({ timedOut: true, exitCode: null, signal: null });
    expect(process.kill.mock.calls).toEqual([["SIGTERM"], ["SIGTERM"], ["SIGKILL"]]);
    process.emit("close", 0, null); process.emit("error", new Error("Synthetic late error"));
    expect(await result).toMatchObject({ exitCode: null, signal: null }); expect(jest.getTimerCount()).toBe(0);
  });

  it("non-assessment/health invocation strips ambient and explicit transport and keeps its old deadline", async () => {
    const process = child(); jest.mocked(spawn).mockReturnValue(process as unknown as ReturnType<typeof spawn>);
    const result = runCli({ command: "/synthetic", args: ["--help"], timeoutMs: 100,
      env: { SOCIAL_MONITOR_ASSESSMENT_DEADLINE_MS: "9999999999" } });
    expect(jest.mocked(spawn).mock.calls[0]?.[2]?.env).not.toHaveProperty("SOCIAL_MONITOR_ASSESSMENT_DEADLINE_MS");
    process.stderr.emit("data", Buffer.from("subscription-runtime-run-agent-task"));
    await jest.advanceTimersByTimeAsync(99); expect(process.kill).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1); expect(process.kill).toHaveBeenCalledWith("SIGTERM");
    process.emit("close", 1, "SIGTERM");
    expect(await result).toMatchObject({ stderr: "subscription-runtime-run-agent-task", timedOut: true, exitCode: 1 });
    expect(jest.getTimerCount()).toBe(0);
  });

  it("does not retain raw assessment stderr and bounds logging at 64 records", async () => {
    const process = child(), receive = jest.fn();
    jest.mocked(spawn).mockReturnValue(process as unknown as ReturnType<typeof spawn>);
    const result = runCli({ command: "/synthetic", args: [], timeoutMs: 60_000, assessment: { onProgress: receive } });
    const line = `assessment-progress-v1 ${JSON.stringify({ version: 1, phase: "setup", transition: "started",
      elapsedMs: 0, remainingMs: 60_000, lastObservedPhase: "setup", providerOutcome: "unknown" })}\n`;
    const junk = Buffer.alloc(2_000_000, 120); process.stderr.emit("data", junk);
    process.stderr.emit("data", Buffer.from(`\n${line.repeat(100)}`));
    expect(receive).toHaveBeenCalledTimes(64);
    process.emit("close", 1, null);
    const receipt = await result;
    expect(receipt.stderr).toBe(""); expect(receipt.stderrBytes).toBe(junk.length + 1 + 100 * Buffer.byteLength(line));
    expect(cliExecutionResult(receipt).failure?.details).toMatchObject({ stderrBytes: String(receipt.stderrBytes) });
  });
});
