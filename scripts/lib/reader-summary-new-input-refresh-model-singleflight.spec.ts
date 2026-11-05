import { guardedRefreshRuntime } from "./reader-summary-new-input-refresh-model";
import { completedRefreshModelRequest, refreshModelCommand } from "./reader-summary-new-input-refresh-model.spec-support";
import { refreshManifest } from "./reader-summary-new-input-refresh.spec-support";
import { sourceContentAssessmentPurpose } from "./reader-summary-new-input-refresh-assessment-runtime";

const command = (id: number) => ({ ...refreshModelCommand(sourceContentAssessmentPurpose),
  requestId: `assessment-${id}`, prompt: JSON.stringify({ candidates: [{ candidateId: `candidate-${id}` }] }) });
const deferred = () => {
  let resolve!: () => void, reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

it("shares overlapping authority checks, preserves per-request consumption, and checks fresh later", async () => {
  const check = deferred();
  const assertCurrent = jest.fn(() => check.promise);
  const runTask = jest.fn(completedRefreshModelRequest), record = jest.fn(), assertLocal = jest.fn();
  const runtime = guardedRefreshRuntime({ manifest: refreshManifest(), now: () => 0,
    delegate: { runTask, checkHealth: jest.fn() }, assertCurrent, assertLocal, record });
  const batch = Array.from({ length: 6 }, (_, index) => runtime.runTask(command(index)));
  await Promise.resolve();
  expect(assertCurrent).toHaveBeenCalledTimes(1);
  expect(runTask).not.toHaveBeenCalled();
  check.resolve();
  await Promise.all(batch);
  expect(runTask).toHaveBeenCalledTimes(6);
  expect(record.mock.calls.filter(([event]) => event.status === "invocation_consumed")).toHaveLength(6);
  await runtime.runTask(command(6));
  expect(assertCurrent).toHaveBeenCalledTimes(2);
  expect(runTask).toHaveBeenCalledTimes(7);
  expect(assertLocal.mock.calls.length).toBeGreaterThanOrEqual(7 * 4);
});

it("invalidates all waiters and the runtime on one rejected authority check", async () => {
  const check = deferred(), assertCurrent = jest.fn(() => check.promise), runTask = jest.fn(), record = jest.fn();
  const runtime = guardedRefreshRuntime({ manifest: refreshManifest(), now: () => 0,
    delegate: { runTask, checkHealth: jest.fn() }, assertCurrent, assertLocal: () => undefined, record });
  const batch = Promise.allSettled(Array.from({ length: 6 }, (_, index) => runtime.runTask(command(index))));
  await Promise.resolve();
  check.reject(new Error("synthetic authority failure"));
  expect((await batch).every((result) => result.status === "rejected")).toBe(true);
  expect(assertCurrent).toHaveBeenCalledTimes(1);
  expect(runTask).not.toHaveBeenCalled();
  expect(record).toHaveBeenCalledTimes(6);
  for (const [event] of record.mock.calls) expect(event).toMatchObject({ status: "requires_reconciliation",
    delegated: false, preDelegationFailureStage: "current_authority" });
  expect(() => runtime.assertUsable()).toThrow(/reconciliation/);
  await expect(runtime.runTask(command(6))).rejects.toThrow();
  expect(assertCurrent).toHaveBeenCalledTimes(1);
});
