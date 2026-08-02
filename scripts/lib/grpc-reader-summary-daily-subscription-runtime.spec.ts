import { canonicalJsonSha256 } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import type { AgentRuntimeClientPort } from "@social-monitor/summary/ports/agent-runtime-client.port";

import { GrpcReaderSummaryDailySubscriptionRuntime } from "./grpc-reader-summary-daily-subscription-runtime";

const scope = {
  tenantId: "10000000-0000-4000-8000-000000000001",
  workspaceId: "20000000-0000-4000-8000-000000000002",
};

describe("GrpcReaderSummaryDailySubscriptionRuntime", () => {
  it("sends v1 authority bytes once through gpt-5.6-sol xhigh subscription runtime", async () => {
    const output = { z: 1, a: "exact" };
    const client = fakeClient(output);
    const runtime = new GrpcReaderSummaryDailySubscriptionRuntime(client);
    const authority = Buffer.from('{"schemaVersion":1,"items":[]}', "utf8");

    const result = await runtime.run({
      ...scope,
      modelJobIdentity: "a".repeat(64),
      requestedUtcDate: "2026-07-31",
      sourceAuthorityBytes: authority,
      signal: new AbortController().signal,
    });

    expect(client.runTask).toHaveBeenCalledTimes(1);
    const command = jest.mocked(client.runTask).mock.calls[0]![0];
    expect(command.prompt).toBe(authority.toString("utf8"));
    expect(command.provider).toBe("codex");
    expect(command.controls).toMatchObject({ model: "gpt-5.6-sol" });
    expect(command.metadata).toMatchObject({
      authoritySchemaVersion: "reader_summary.daily_source_authority.v1",
      reasoningEffort: "xhigh",
    });
    expect(result.responseBytes.toString("utf8")).toBe('{"a":"exact","z":1}');
  });

  it("rejects non-attested, wrong-model, and aborted executions", async () => {
    const output = { value: true };
    const wrongModel = fakeClient(output, "wrong");
    await expect(new GrpcReaderSummaryDailySubscriptionRuntime(wrongModel).run(
      runtimeInput(),
    )).rejects.toThrow(/invalid product result/u);

    const aborted = new AbortController();
    aborted.abort(new Error("lease lost"));
    const client = fakeClient(output);
    await expect(new GrpcReaderSummaryDailySubscriptionRuntime(client).run({
      ...runtimeInput(), signal: aborted.signal,
    })).rejects.toThrow("lease lost");
    expect(client.runTask).not.toHaveBeenCalled();
  });
});

const runtimeInput = () => ({
  ...scope,
  modelJobIdentity: "a".repeat(64),
  requestedUtcDate: "2026-07-31",
  sourceAuthorityBytes: Buffer.from("{}"),
  signal: new AbortController().signal,
});

const fakeClient = (output: Record<string, unknown>, selectedModel = "gpt-5.6-sol") => ({
  runTask: jest.fn(async () => ({
    status: "completed" as const,
    structuredOutput: output,
    warnings: [],
    executionAttestation: {
      schemaVersion: 1 as const,
      requestId: "daily",
      purpose: "social_monitor.reader_summary.generate",
      canonicalRequestSha256: "a".repeat(64),
      provider: "codex" as const,
      model: selectedModel,
      reasoningEffort: "xhigh",
      runtimeEngine: "subscription-runtime-cli" as const,
      runtimePackageVersion: "1.2.3",
      launcherSha256: "b".repeat(64),
      selectedOutputKind: "structured_output" as const,
      selectedOutputSha256: canonicalJsonSha256(output),
    },
  })),
  checkHealth: jest.fn(),
}) satisfies jest.Mocked<AgentRuntimeClientPort>;
