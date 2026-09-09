import type { AgentRuntimeTaskResult } from "@social-monitor/summary/ports";
import { guardedRefreshRuntime, refreshCaptureModelControls, refreshGenerationSha256, type RefreshModelCaptureEvent } from "./reader-summary-new-input-refresh-model";
import { completedRefreshModelRequest, refreshModelCommand } from "./reader-summary-new-input-refresh-model.spec-support";
import { refreshHash } from "./reader-summary-new-input-refresh-manifest";
import { readAgentRuntimeObjectOutput } from "@social-monitor/summary/adapters/model/agent-runtime-model-support";
import { refreshManifest } from "./reader-summary-new-input-refresh.spec-support";

function wiring(runTask: jest.Mock, capture?: (event: RefreshModelCaptureEvent) => void, captureFailure = jest.fn()) {
  return { runtime: guardedRefreshRuntime({ manifest: refreshManifest(),
    delegate: { runTask, checkHealth: jest.fn() }, assertLocal: () => undefined,
    assertCurrent: async () => undefined, record: jest.fn(), capture, captureFailure }), captureFailure };
}

describe("refresh runtime private capture (synthetic transport)", () => {
  it("exports concrete controls matching the existing generation hash without clients", () => {
    const controls = refreshCaptureModelControls({});
    expect(refreshHash(controls)).toBe(refreshGenerationSha256({}));
    expect(controls.assessment).toMatchObject({ candidates: 200 });
    expect(controls.generation).toHaveLength(4);
    for (const options of controls.generation) expect(options).not.toHaveProperty("client");
    expect(JSON.parse(JSON.stringify(controls))).toEqual(controls);
  });

  it("exports only structured bytes consumed by the real parser and rejects text-only envelopes", async () => {
    const command = refreshModelCommand();
    const attested = await completedRefreshModelRequest(command);
    const result = { ...attested, outputText: "unused diagnostic" };
    const events: RefreshModelCaptureEvent[] = [];
    const { runtime } = wiring(jest.fn(async () => result), (event) => events.push(event));
    const returned = await runtime.runTask(command);
    const parseText = jest.fn();
    expect(readAgentRuntimeObjectOutput(returned, parseText, "synthetic")).toEqual(attested.structuredOutput);
    expect(parseText).not.toHaveBeenCalled();
    expect(events.at(-1)).toMatchObject({ kind: "envelope_verified", result: { structuredOutput: attested.structuredOutput } });
    expect(JSON.stringify(events)).not.toContain("unused diagnostic");

    const textEvents: RefreshModelCaptureEvent[] = [];
    const textOnly = { ...attested, structuredOutput: undefined, outputText: JSON.stringify(attested.structuredOutput) };
    const textRuntime = wiring(jest.fn(async () => textOnly), (event) => textEvents.push(event)).runtime;
    await expect(textRuntime.runTask(command)).rejects.toThrow(/ambiguous/);
    expect(textEvents.some((event) => event.kind === "envelope_verified")).toBe(false);
  });

  it("captures the same invocation and verified selected output with observation parity", async () => {
    const command = refreshModelCommand();
    const result = await completedRefreshModelRequest(command);
    const events: RefreshModelCaptureEvent[] = [];
    const observedCall = jest.fn(async () => result), plainCall = jest.fn(async () => result);
    const observed = wiring(observedCall, (event) => events.push(event));
    const plain = wiring(plainCall);
    expect(await observed.runtime.runTask(command)).toEqual(await plain.runtime.runTask(command));
    expect(events.map((event) => event.kind)).toEqual(["invocation_started", "invocation_returned", "envelope_verified"]);
    expect(events[2]).toMatchObject({ command, result: { structuredOutput: result.structuredOutput,
      executionAttestation: result.executionAttestation } });
    expect(observedCall).toHaveBeenCalledTimes(1);
    expect(plainCall).toHaveBeenCalledTimes(1);
    expect(observed.captureFailure).not.toHaveBeenCalled();
  });

  it("isolates observer mutation and exceptions without poisoning or retrying consumed work", async () => {
    const command = refreshModelCommand();
    const originalPrompt = command.prompt;
    const result = await completedRefreshModelRequest(command);
    const runTask = jest.fn(async () => result);
    const { runtime, captureFailure } = wiring(runTask, (event) => {
      if (event.kind === "invocation_started") Object.assign(event.command, { prompt: "mutated" });
      if (event.kind === "envelope_verified") Object.assign(event.result, { structuredOutput: { forged: true } });
      throw new Error("synthetic capture write denied");
    });
    expect(await runtime.runTask(command)).toEqual(result);
    expect(command.prompt).toBe(originalPrompt);
    expect(result.structuredOutput).toEqual({ groups: [] });
    expect(() => runtime.assertUsable()).not.toThrow();
    expect(captureFailure).toHaveBeenCalledTimes(3);
    await expect(runtime.runTask(command)).rejects.toThrow(/budget/);
    expect(runTask).toHaveBeenCalledTimes(1);
  });

  it("retains failed return status without raw error or output bytes", async () => {
    const events: RefreshModelCaptureEvent[] = [];
    const runTask = jest.fn(async (): Promise<AgentRuntimeTaskResult> => ({ status: "failed", warnings: [],
      outputText: "unvalidated sensitive diagnostic" }));
    const { runtime } = wiring(runTask, (event) => events.push(event));
    await expect(runtime.runTask(refreshModelCommand())).rejects.toThrow(/ambiguous/);
    expect(events.map((event) => event.kind)).toEqual(["invocation_started", "invocation_returned", "invocation_failed"]);
    expect(events[2]).toMatchObject({ delegated: true });
    expect(JSON.stringify(events)).not.toContain("sensitive diagnostic");
    expect(runTask).toHaveBeenCalledTimes(1);
  });

  it("does not export an unknown runtime status as free diagnostic text", async () => {
    const events: RefreshModelCaptureEvent[] = [];
    const runTask = jest.fn(async () => ({ status: "untrusted diagnostic", warnings: [] } as unknown as AgentRuntimeTaskResult));
    const { runtime, captureFailure } = wiring(runTask, (event) => events.push(event));
    await expect(runtime.runTask(refreshModelCommand())).rejects.toThrow(/ambiguous/);
    expect(events.map((event) => event.kind)).toEqual(["invocation_started", "invocation_failed"]);
    expect(captureFailure).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(events)).not.toContain("untrusted diagnostic");
    expect(runTask).toHaveBeenCalledTimes(1);
  });

  it("records abort of consumed work once without changing cancellation or retry semantics", async () => {
    for (const observe of [false, true]) {
      const controller = new AbortController();
      const events: RefreshModelCaptureEvent[] = [];
      const remove = jest.spyOn(controller.signal, "removeEventListener");
      const runTask = jest.fn(async () => {
        controller.abort("synthetic reason must not be captured");
        throw new Error("synthetic cancellation detail must not be captured");
      });
      const { runtime } = wiring(runTask, observe ? (event) => events.push(event) : undefined);
      await expect(runtime.runTask(refreshModelCommand(), { signal: controller.signal })).rejects.toThrow(/original operation remains consumed/);
      expect(runTask).toHaveBeenCalledTimes(1);
      expect(() => runtime.assertUsable()).toThrow(/reconciliation/);
      await expect(runtime.runTask(refreshModelCommand())).rejects.toThrow(/budget/);
      expect(runTask).toHaveBeenCalledTimes(1);
      if (observe) {
        expect(events.map((event) => event.kind)).toEqual(["invocation_started", "invocation_aborted", "invocation_failed"]);
        expect(events.at(-1)).toMatchObject({ delegated: true });
        expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
        expect(JSON.stringify(events)).not.toContain("must not be captured");
      } else {
        expect(events).toEqual([]);
        expect(remove).not.toHaveBeenCalled();
      }
    }
  });

  it("never exports an alternate-request attestation as verified", async () => {
    const command = refreshModelCommand();
    const alternate = await completedRefreshModelRequest({ ...command, prompt: "alternate synthetic request" });
    const events: RefreshModelCaptureEvent[] = [];
    const runTask = jest.fn(async () => alternate);
    const { runtime } = wiring(runTask, (event) => events.push(event));
    await expect(runtime.runTask(command)).rejects.toThrow(/ambiguous/);
    expect(events.some((event) => event.kind === "envelope_verified")).toBe(false);
    expect(events.at(-1)).toMatchObject({ kind: "invocation_failed", delegated: true });
    expect(runTask).toHaveBeenCalledTimes(1);
  });
});
