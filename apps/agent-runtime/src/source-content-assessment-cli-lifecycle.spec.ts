import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { SubscriptionRuntimeCliExecutor } from "./subscription-runtime-cli-executor";
import type { SubscriptionRuntimeInstallationIdentity } from "./subscription-runtime-installation";
import { assessmentRequest, syntheticInstallation } from "./source-content-assessment-runtime.spec-support";

jest.mock("node:child_process", () => ({ spawn: jest.fn() }));
jest.mock("node:fs/promises", () => ({ mkdtemp: jest.fn(), rm: jest.fn(), writeFile: jest.fn() }));

const children: SyntheticChild[] = [];
class SyntheticChild extends EventEmitter {
  pid: number | undefined = 123;
  readonly stdout = Object.assign(new EventEmitter(), { destroy: jest.fn() });
  readonly stderr = Object.assign(new EventEmitter(), { destroy: jest.fn() });
  readonly unref = jest.fn();
  readonly kill = jest.fn(() => true);
  close(exitCode: number | null = 0, signal: string | null = null, status = "completed") {
    this.stdout.emit("data", Buffer.from(JSON.stringify({
      status, structuredOutput: { reviews: [] }, warnings: [],
      ...(status === "failed" ? { failure: { code: "provider_session_invalid", reconnectRequired: true } } : {}),
    })));
    this.emit("close", exitCode, signal);
  }
}
const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
const installation: SubscriptionRuntimeInstallationIdentity = {
  ...syntheticInstallation, packageRootRealpath: "/synthetic",
};
const makeRun = () => { const executor = new SubscriptionRuntimeCliExecutor({
  command: installation.executablePath, ephemeral: false,
  installationInspector: { inspect: jest.fn(async () => installation) }, logger,
}); return executor.execute.bind(executor); };
const waitForChild = async (count: number) => {
  for (let turn = 0; turn < 30 && children.length < count; turn++) await Promise.resolve();
  expect(children).toHaveLength(count);
  return children[count - 1]!;
};
const expectIndependentCompletion = async (run: ReturnType<typeof makeRun>) => {
  const count = children.length + 1;
  const result = run(assessmentRequest(`independent-${count}`));
  (await waitForChild(count)).close();
  expect(await result).toMatchObject({ status: "completed", executionAttestation: {
    requestId: `independent-${count}`, purpose: assessmentRequest().purpose,
    model: "gpt-5.6-sol", reasoningEffort: "high", selectedOutputKind: "structured_output",
  } });
};

beforeEach(() => {
  jest.clearAllMocks();
  children.length = 0;
  jest.mocked(mkdtemp).mockResolvedValue("/synthetic/request-dir");
  jest.mocked(writeFile).mockResolvedValue(undefined);
  jest.mocked(rm).mockResolvedValue(undefined);
  jest.mocked(spawn).mockImplementation(() => {
    const child = new SyntheticChild();
    children.push(child);
    return child as unknown as ReturnType<typeof spawn>;
  });
});
afterEach(() => jest.useRealTimers());

it("does not launch or retry a prelaunch write failure", async () => {
  const run = makeRun();
  jest.mocked(writeFile).mockRejectedValueOnce(new Error("Synthetic ENOSPC"));
  expect(await run(assessmentRequest())).toMatchObject({ status: "failed", failure: { retryable: false } });
  expect(spawn).not.toHaveBeenCalled();
  await expectIndependentCompletion(run);
});

it("does not retry synchronous spawn failure", async () => {
  const run = makeRun();
  jest.mocked(spawn).mockImplementationOnce(() => { throw new Error("Synthetic spawn failure"); });
  expect(await run(assessmentRequest())).toMatchObject({ status: "failed", failure: { retryable: false } });
  expect(spawn).toHaveBeenCalledTimes(1);
  await expectIndependentCompletion(run);
});

it("does not retry asynchronous spawn failure before any process started", async () => {
  const run = makeRun();
  jest.mocked(spawn).mockImplementationOnce(() => {
    const child = new SyntheticChild();
    child.pid = undefined;
    children.push(child);
    return child as unknown as ReturnType<typeof spawn>;
  });
  const result = run(assessmentRequest());
  const rejected = expect(result).resolves.toMatchObject({ status: "failed", failure: { retryable: false } });
  (await waitForChild(1)).emit("error", new Error("Synthetic ENOENT"));
  await rejected;
  await expectIndependentCompletion(run);
});

it("keeps completed attestation when cleanup fails", async () => {
  const run = makeRun();
  jest.mocked(rm).mockRejectedValueOnce(new Error("Synthetic cleanup failure"));
  await expectIndependentCompletion(run);
  expect(logger.error).toHaveBeenCalledWith("agent runtime task rejected", expect.objectContaining({ stage: "cleanup" }));
  await expectIndependentCompletion(run);
});

it("suppresses late completion after observation error and isolates cleanup failure", async () => {
  const run = makeRun();
  jest.mocked(rm).mockRejectedValueOnce(new Error("Synthetic cleanup failure"));
  const result = run(assessmentRequest());
  const child = await waitForChild(1);
  child.emit("error", new Error("Synthetic observation failure"));
  expect(await result).toMatchObject({ status: "failed", failure: { retryable: false } });
  child.close();
  expect((await result).executionAttestation).toBeUndefined();
  expect(spawn).toHaveBeenCalledTimes(1);
  await expectIndependentCompletion(run);
});

it.each(["timeout", "signal"])("rejects output after %s without retry", async (scenario) => {
  jest.useFakeTimers();
  const run = makeRun();
  const result = run(assessmentRequest());
  const child = await waitForChild(1);
  if (scenario === "timeout") {
    await jest.advanceTimersByTimeAsync(100);
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  }
  child.close(null, "SIGTERM");
  expect(await result).toMatchObject({ status: "failed" });
  expect((await result).executionAttestation).toBeUndefined();
  await jest.advanceTimersByTimeAsync(600_000);
  expect((await result).failure?.retryable).toBe(false);
  expect(spawn).toHaveBeenCalledTimes(1);
});

it("does not retry terminal reconnect failures in the assessment lane", async () => {
  const run = makeRun();
  const result = run(assessmentRequest());
  (await waitForChild(1)).close(0, null, "failed");
  expect(await result).toMatchObject({ status: "failed" });
  expect((await result).executionAttestation).toBeUndefined();
  expect(spawn).toHaveBeenCalledTimes(1);
  await expectIndependentCompletion(run);
});

it("bounds cleanup when a child ignores SIGTERM and never closes", async () => {
  jest.useFakeTimers();
  const run = makeRun();
  const result = run(assessmentRequest());
  const child = await waitForChild(1);
  await jest.advanceTimersByTimeAsync(1_100);
  expect(await result).toMatchObject({ status: "failed", failure: { code: "agent_runtime.cli_timeout", retryable: false } });
  expect(child.kill.mock.calls).toEqual([["SIGTERM"], ["SIGKILL"]]);
  expect(child.stdout.destroy).toHaveBeenCalledTimes(1);
  expect(child.stderr.destroy).toHaveBeenCalledTimes(1);
  expect(child.unref).toHaveBeenCalledTimes(1);
  child.close();
  child.emit("error", new Error("Synthetic late error"));
  expect((await result).executionAttestation).toBeUndefined();
  expect(spawn).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

it.each([0, 1, 2])("numeric exit %i alone cannot admit evidence or trigger retry", async (code) => {
  const run = makeRun();
  const result = run(assessmentRequest());
  (await waitForChild(1)).emit("close", code, null);
  expect(await result).toMatchObject({ status: "failed", failure: { retryable: false } });
  expect((await result).executionAttestation).toBeUndefined();
  expect(spawn).toHaveBeenCalledTimes(1);
});

it.each([1, 2])("rejects plausible completed JSON with exit %i", async (code) => {
  const result = makeRun()(assessmentRequest());
  (await waitForChild(1)).close(code);
  expect(await result).toMatchObject({ status: "failed", failure: { retryable: false } });
  expect((await result).executionAttestation).toBeUndefined();
  expect(spawn).toHaveBeenCalledTimes(1);
});

it.each([1, 2])("failed envelope with exit %i stays nonretryable", async (exit) => {
  const result = makeRun()(assessmentRequest());
  (await waitForChild(1)).close(exit, null, "failed");
  expect(await result).toMatchObject({ status: "failed", failure: {
    code: "provider_session_invalid", reconnectRequired: true, retryable: false,
  } });
  expect((await result).executionAttestation).toBeUndefined();
  expect(spawn).toHaveBeenCalledTimes(1);
});

it("cleanup exceptions cannot replace the timeout failure", async () => {
  jest.useFakeTimers();
  const result = makeRun()(assessmentRequest());
  const child = await waitForChild(1);
  child.kill.mockImplementation(() => { throw new Error("Synthetic signal failure"); });
  child.stdout.destroy.mockImplementation(() => { throw new Error("Synthetic cleanup failure"); });
  await jest.advanceTimersByTimeAsync(1_100);
  expect(await result).toMatchObject({ status: "failed", failure: {
    code: "agent_runtime.cli_timeout", retryable: false,
  } });
  expect(child.stderr.destroy).toHaveBeenCalled();
  expect(child.unref).toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});
