import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { SubscriptionRuntimeCliExecutor } from "./subscription-runtime-cli-executor";
import { assessmentExecutionWithLease } from "./source-content-assessment-execution-lease";
import { assessmentRequest, syntheticInstallation } from "./source-content-assessment-lease.spec-support";

jest.mock("node:child_process", () => ({ spawn: jest.fn() }));
jest.mock("node:fs/promises", () => ({ mkdtemp: jest.fn(), rm: jest.fn(), writeFile: jest.fn() }));

const children: SyntheticChild[] = [];
class SyntheticChild extends EventEmitter {
  pid: number | undefined = 123;
  readonly stdout = new EventEmitter();
  readonly stderr = new EventEmitter();
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
const makeRun = () => assessmentExecutionWithLease(new SubscriptionRuntimeCliExecutor({
  command: syntheticInstallation.executablePath, ephemeral: false,
  installationInspector: { inspect: jest.fn(async () => syntheticInstallation) }, logger,
}));
const waitForChild = async (count: number) => {
  for (let turn = 0; turn < 30 && children.length < count; turn++) await Promise.resolve();
  expect(children).toHaveLength(count);
  return children[count - 1]!;
};
const expectReusable = async (run: ReturnType<typeof makeRun>) => {
  const count = children.length + 1;
  const result = run(assessmentRequest());
  (await waitForChild(count)).close();
  expect(await result).toMatchObject({ status: "completed", executionAttestation: {
    requestId: "synthetic-task-a", purpose: assessmentRequest().purpose,
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

it("releases a prelaunch write failure with zero launches", async () => {
  const run = makeRun();
  jest.mocked(writeFile).mockRejectedValueOnce(new Error("Synthetic ENOSPC"));
  await expect(run(assessmentRequest())).rejects.toThrow("ENOSPC");
  expect(spawn).not.toHaveBeenCalled();
  await expectReusable(run);
});

it("releases synchronous spawn failure", async () => {
  const run = makeRun();
  jest.mocked(spawn).mockImplementationOnce(() => { throw new Error("Synthetic spawn failure"); });
  await expect(run(assessmentRequest())).rejects.toThrow("spawn failure");
  await expectReusable(run);
});

it("releases asynchronous spawn failure before any process started", async () => {
  const run = makeRun();
  jest.mocked(spawn).mockImplementationOnce(() => {
    const child = new SyntheticChild();
    child.pid = undefined;
    children.push(child);
    return child as unknown as ReturnType<typeof spawn>;
  });
  const result = run(assessmentRequest());
  const rejected = expect(result).rejects.toThrow("Synthetic ENOENT");
  (await waitForChild(1)).emit("error", new Error("Synthetic ENOENT"));
  await rejected;
  await expectReusable(run);
});

it("keeps terminal attestation and releases ownership when cleanup fails", async () => {
  const run = makeRun();
  jest.mocked(rm).mockRejectedValueOnce(new Error("Synthetic cleanup failure"));
  await expectReusable(run);
  expect(logger.error).toHaveBeenCalledWith("agent runtime task rejected", expect.objectContaining({ stage: "cleanup" }));
  await expectReusable(run);
});

it("retains a started error through cleanup failure and releases on later terminal close", async () => {
  const run = makeRun();
  jest.mocked(rm).mockRejectedValueOnce(new Error("Synthetic cleanup failure"));
  const result = run(assessmentRequest());
  const rejected = expect(result).rejects.toThrow("Synthetic observation failure");
  const child = await waitForChild(1);
  child.emit("error", new Error("Synthetic observation failure"));
  await rejected;
  expect(await run(assessmentRequest())).toMatchObject({ failure: { code: "assessment_execution_leased" } });
  const other = run(assessmentRequest("independent"));
  (await waitForChild(2)).close();
  expect((await other).status).toBe("completed");
  child.close();
  await expectReusable(run);
});

it.each(["timeout", "signal"])("does not release unknown provider work after %s", async (scenario) => {
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
  expect(await run(assessmentRequest())).toMatchObject({ failure: { code: "assessment_execution_leased" } });
  expect(spawn).toHaveBeenCalledTimes(1);
});

it("does not retry terminal reconnect failures in the assessment lane", async () => {
  const run = makeRun();
  const result = run(assessmentRequest());
  (await waitForChild(1)).close(0, null, "failed");
  expect(await result).toMatchObject({ status: "failed" });
  expect((await result).executionAttestation).toBeUndefined();
  expect(spawn).toHaveBeenCalledTimes(1);
  await expectReusable(run);
});
