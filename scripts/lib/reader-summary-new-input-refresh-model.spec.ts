import { canonicalJsonSha256 } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import { activeReaderSummaryPurposes as purposes } from "@social-monitor/summary/adapters/model/active-reader-summary-generation-profile";
import type { AgentRuntimeTaskCommand, ReaderSummaryPublicationCommand } from "@social-monitor/summary/ports";
import type { PrismaReaderSummaryClient } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-client";
import { admitSubscriptionRuntimeRequest } from "../../apps/agent-runtime/src/subscription-runtime-purpose-model-policy";
import type { AgentRuntimeExecutionRequest } from "../../apps/agent-runtime/src/agent-runtime-executor.port";
import { refreshPublicationGuard } from "./reader-summary-new-input-refresh-execution";
import { guardedRefreshRuntime } from "./reader-summary-new-input-refresh-model";
import { attestRefreshExecution, completedRefreshModelRequest, refreshModelCommand, refreshTestRuntimeClient } from "./reader-summary-new-input-refresh-model.spec-support";
import { refreshManifest } from "./reader-summary-new-input-refresh.spec-support";

const admittedPurposes = [purposes.generate, purposes.storyRelations, purposes.topicLabel,
  purposes.topicRelations, purposes.relatedTopicRelations];

describe("refresh exact canonical request binding", () => {
  it("admits MiMo generation with its attested package and retains Codex topic admission", async () => {
    const generation = { ...refreshModelCommand(purposes.generate), controls: {
      model: "mimo-v2.6-pro", modelBackend: "xiaomi-mimo-token-plan", reasoningEffort: "high",
    } };
    const execute = jest.fn((request: AgentRuntimeExecutionRequest) => attestRefreshExecution(request));
    const runtime = guardedRefreshRuntime({ manifest: refreshManifest(),
      delegate: refreshTestRuntimeClient(execute), assertLocal: () => undefined,
      assertCurrent: async () => undefined, record: jest.fn() });
    await expect(runtime.runTask(generation)).resolves.toMatchObject({ status: "completed",
      executionAttestation: { model: "mimo-v2.6-pro", runtimePackageVersion: "0.1.0-main.40-sm-mimo.1" } });
    await expect(runtime.runTask(refreshModelCommand(purposes.topicLabel))).resolves.toMatchObject({
      status: "completed", executionAttestation: { model: "gpt-5.6-sol" },
    });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("rejects MiMo on topic and MiMo generation without its exact backend before delegation", async () => {
    for (const command of [
      { ...refreshModelCommand(purposes.topicLabel), controls: { model: "mimo-v2.6-pro",
        modelBackend: "xiaomi-mimo-token-plan", reasoningEffort: "high" } },
      { ...refreshModelCommand(purposes.generate), controls: { model: "mimo-v2.6-pro",
        reasoningEffort: "high" } },
    ]) {
      const runTask = jest.fn();
      const runtime = guardedRefreshRuntime({ manifest: refreshManifest(),
        delegate: { runTask, checkHealth: jest.fn() }, assertLocal: () => undefined,
        assertCurrent: async () => undefined, record: jest.fn() });
      await expect(runtime.runTask(command)).rejects.toThrow(/authority rejected/);
      expect(runTask).not.toHaveBeenCalled();
    }
  });

  it("requires the pinned MiMo package in the generation execution attestation", async () => {
    const command = { ...refreshModelCommand(purposes.generate), controls: {
      model: "mimo-v2.6-pro", modelBackend: "xiaomi-mimo-token-plan", reasoningEffort: "high",
    } };
    const valid = await completedRefreshModelRequest(command);
    const altered = { ...valid, executionAttestation: {
      ...valid.executionAttestation!, runtimePackageVersion: "0.1.0-main.40-sm-mimo.2",
    } };
    const runtime = guardedRefreshRuntime({ manifest: refreshManifest(),
      delegate: { runTask: async () => altered, checkHealth: jest.fn() },
      assertLocal: () => undefined, assertCurrent: async () => undefined, record: jest.fn() });
    await expect(runtime.runTask(command)).rejects.toThrow(/ambiguous/);
    expect(() => runtime.assertUsable()).toThrow(/reconciliation/);
  });
  it.each(admittedPurposes)("rejects a well-formed digest for alternate prompt bytes: %s", async (purpose) => {
    const command = refreshModelCommand(purpose);
    const correct = await completedRefreshModelRequest(command);
    const alternate = await completedRefreshModelRequest({ ...command, prompt: command.prompt + " alternate" });
    expect(alternate.executionAttestation).toMatchObject({ requestId: command.requestId, purpose,
      model: "gpt-5.6-sol", reasoningEffort: "high", canonicalRequestSha256: expect.stringMatching(/^[0-9a-f]{64}$/u) });
    expect(alternate.executionAttestation!.canonicalRequestSha256).not.toBe(correct.executionAttestation!.canonicalRequestSha256);
    const events: unknown[] = [];
    const runTask = jest.fn(async () => alternate);
    const runtime = guardedRefreshRuntime({ manifest: refreshManifest(), delegate: { runTask, checkHealth: jest.fn() },
      assertLocal: () => undefined, assertCurrent: async () => undefined, record: (event) => events.push(event) });

    await expect(runtime.runTask(command)).rejects.toThrow(/ambiguous/);
    expect(events).toContainEqual(expect.objectContaining({ status: "requires_reconciliation" }));
    expect(events).not.toContainEqual(expect.objectContaining({ status: "completed" }));
    for (const followup of admittedPurposes) {
      await expect(runtime.runTask({ ...refreshModelCommand(followup), requestId: `followup:${followup}` })).rejects.toThrow(/budget/);
    }
    expect(runTask).toHaveBeenCalledTimes(1);
    expect(() => runtime.assertUsable()).toThrow(/reconciliation/);
    const assertProtected = jest.fn(), assertCurrent = jest.fn();
    const publication = refreshPublicationGuard({ manifest: refreshManifest(), jobId: "synthetic",
      assertLocal: () => runtime.assertUsable(), assertProtected, assertCurrent });
    await expect(publication({} as PrismaReaderSummaryClient, {} as ReaderSummaryPublicationCommand)).rejects.toThrow(/reconciliation/);
    expect(assertProtected).not.toHaveBeenCalled();
    expect(assertCurrent).not.toHaveBeenCalled();
  });

  it.each(admittedPurposes)("accepts actual transport/admission defaults and normalization: %s", async (purpose) => {
    for (const optional of [undefined, "", " \t ", "  synthetic-value  "]) {
      const base = refreshModelCommand(purpose);
      const schema = { type: "object", properties: { z: { type: "string" }, a: { type: "number" } } };
      const command = { ...base, providerInstanceId: optional, cwd: optional, outputSchema: schema,
        ...(optional === undefined && purpose !== purposes.relatedTopicRelations ? { metadata: undefined } : {}),
        controls: { ...base.controls, ...(optional === undefined ? {} : {
          outputKind: " structured_output ", runtimeOutput: "structured_output", selectedOutputKind: "structured_output",
          outputSchemaJson: JSON.stringify(schema), responseFormat: " json ",
        }) },
      };
      const execute = jest.fn(async (request) => {
        const canonical = admitSubscriptionRuntimeRequest(request).canonicalRequest;
        expect(canonical).toMatchObject({ protocolVersion: 1, runId: command.requestId,
          providerInstanceId: optional?.trim() || undefined, cwd: optional?.trim() || undefined,
          task: { prompt: command.prompt, controls: { model: "gpt-5.6-sol", reasoningEffort: "high",
            responseFormat: "json", outputSchema: schema }, metadata: { runtimeOutput: "structured_output" } },
        });
        const result = await attestRefreshExecution(request);
        expect(result.executionAttestation!.canonicalRequestSha256).toBe(canonicalJsonSha256(canonical));
        expect(result.executionAttestation!.canonicalRequestSha256).not.toBe(canonicalJsonSha256(command));
        return result;
      });
      const runtime = guardedRefreshRuntime({ manifest: refreshManifest(), delegate: refreshTestRuntimeClient(execute),
        assertLocal: () => undefined, assertCurrent: async () => undefined, record: jest.fn() });
      await expect(runtime.runTask(command)).resolves.toMatchObject({ status: "completed" });
      expect(execute).toHaveBeenCalledTimes(1);
      expect(() => runtime.assertUsable()).not.toThrow();
    }
  });

  it("binds the invocation before an awaited delegate can change the command", async () => {
    const command = { ...refreshModelCommand() };
    const runTask = jest.fn(async (request: AgentRuntimeTaskCommand) => {
      command.prompt = "Changed during delegate invocation";
      return completedRefreshModelRequest(request);
    });
    const runtime = guardedRefreshRuntime({ manifest: refreshManifest(), delegate: { runTask, checkHealth: jest.fn() },
      assertLocal: () => undefined, assertCurrent: async () => undefined, record: jest.fn() });
    await expect(runtime.runTask(command)).rejects.toThrow(/ambiguous/);
    expect(() => runtime.assertUsable()).toThrow(/reconciliation/);
  });
});
