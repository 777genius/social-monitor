import { assessmentExecutionWithLease } from "./source-content-assessment-execution-lease";
import type { AgentRuntimeExecutionRequest } from "./agent-runtime-executor.port";

it("retains the assessment lease after indeterminate executor failure without blocking other purposes", async () => {
  const execute = jest.fn(async () => { throw new Error("Synthetic indeterminate execution"); });
  const run = assessmentExecutionWithLease({ execute, checkHealth: jest.fn() });
  const request = { purpose: "social_monitor.relevance.assess_source_content.v1" } as AgentRuntimeExecutionRequest;
  await expect(run(request)).rejects.toThrow("indeterminate");
  expect(await run(request)).toMatchObject({ status: "failed", failure: { code: "assessment_execution_leased" } });
  expect(execute).toHaveBeenCalledTimes(1);
  await expect(run({ ...request, purpose: "other" })).rejects.toThrow("indeterminate");
  expect(execute).toHaveBeenCalledTimes(2);
});
