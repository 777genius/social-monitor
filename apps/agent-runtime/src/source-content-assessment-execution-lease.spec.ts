import { assessmentExecutionWithLease } from "./source-content-assessment-execution-lease";
import type { AgentRuntimeExecutionObserver, AgentRuntimeExecutionResult } from "./agent-runtime-executor.port";
import { assessmentRequest } from "./source-content-assessment-lease.spec-support";

const completed: AgentRuntimeExecutionResult = { status: "completed", warnings: [] };
const leased = { status: "failed", failure: { code: "assessment_execution_leased" } };

it("retains only the indeterminate execution, without a timed expiry", async () => {
  jest.useFakeTimers();
  try {
    const execute = jest.fn(async () => { throw new Error("Synthetic indeterminate execution"); });
    const run = assessmentExecutionWithLease({ execute, checkHealth: jest.fn() });
    await expect(run(assessmentRequest())).rejects.toThrow("indeterminate");
    await jest.advanceTimersByTimeAsync(600_000);
    expect(await run(assessmentRequest())).toMatchObject(leased);
    await expect(run(assessmentRequest("independent"))).rejects.toThrow("indeterminate");
    await expect(run({ ...assessmentRequest(), purpose: "other" })).rejects.toThrow("indeterminate");
    expect(execute).toHaveBeenCalledTimes(3);
  } finally { jest.useRealTimers(); }
});

it.each(["not_started", "terminal"] as const)("releases rejected %s executions", async (state) => {
  const execute = jest.fn(async (_request, observe?: AgentRuntimeExecutionObserver) => {
    observe?.(state);
    throw new Error("Synthetic failure");
  });
  const run = assessmentExecutionWithLease({ execute, checkHealth: jest.fn() });
  await expect(run(assessmentRequest())).rejects.toThrow("Synthetic failure");
  await expect(run(assessmentRequest())).rejects.toThrow("Synthetic failure");
  expect(execute).toHaveBeenCalledTimes(2);
});

it("retains an explicitly indeterminate returned failure until executor evidence settles it", async () => {
  let observe!: AgentRuntimeExecutionObserver;
  const execute = jest.fn(async (_request, observer?: AgentRuntimeExecutionObserver) => {
    observe = observer!;
    observe("indeterminate");
    return { status: "failed" as const, warnings: [] };
  });
  const run = assessmentExecutionWithLease({ execute, checkHealth: jest.fn() });
  await run(assessmentRequest());
  expect(await run(assessmentRequest())).toMatchObject(leased);
  observe("terminal");
  await run(assessmentRequest());
  expect(execute).toHaveBeenCalledTimes(2);
});

it("lets two healthy executions use synthetic pool capacity and preserves each ownership", async () => {
  const owners = new Map<string, () => void>();
  const execute = jest.fn(async (request) => {
    // The pool owns its finite capacity; the service does not add a singleton.
    if (owners.size === 2) return { status: "failed" as const, warnings: [] };
    return new Promise<AgentRuntimeExecutionResult>((resolve) => {
      owners.set(request.requestId, () => { owners.delete(request.requestId); resolve(completed); });
    });
  });
  const run = assessmentExecutionWithLease({ execute, checkHealth: jest.fn() });
  const a = run(assessmentRequest());
  const b = run(assessmentRequest("b"));
  expect(owners.size).toBe(2);
  expect(await run(assessmentRequest())).toMatchObject(leased);
  owners.get("b")!();
  await b;
  expect(await run(assessmentRequest())).toMatchObject(leased);
  const c = run(assessmentRequest("c"));
  expect(owners.size).toBe(2);
  owners.get("c")!();
  owners.get("synthetic-task-a")!();
  await Promise.all([a, c]);
  const reused = run(assessmentRequest());
  owners.get("synthetic-task-a")!();
  await reused;
  expect(execute).toHaveBeenCalledTimes(4);
});
