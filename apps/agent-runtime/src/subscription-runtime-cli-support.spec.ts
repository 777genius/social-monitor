import { cliExecutionResult, parseSubscriptionRuntimeCliResult } from "./subscription-runtime-cli-support";

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
