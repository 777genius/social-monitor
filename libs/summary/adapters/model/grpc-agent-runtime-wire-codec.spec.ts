import {
  AgentRuntimeHealthStatus,
  AgentRuntimeSelectedOutputKind,
  AgentRuntimeTaskStatus,
  type AgentRuntimeTaskResponse,
  AgentRuntimeProvider,
} from "@social-monitor/contracts/generated/grpc/agent_runtime/v1/agent_runtime";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import type { AgentRuntimeTaskCommand } from "../../ports";
import { readGrpcTaskFailure } from "./grpc-agent-runtime-failure-projection";
import { readExecutionAttestation } from "./grpc-agent-runtime-attestation-decoder";
import { readGrpcUsage, readOptionalDurationMs } from "./grpc-agent-runtime-measurement-decoder";
import {
  agentRuntimeWireSchemaVersion,
  fromGrpcTaskResponse,
  fromGrpcHealthStatus,
  toGrpcProvider,
} from "./grpc-agent-runtime-wire-codec";
import {
  readGrpcOptionalOutputText,
  readGrpcOptionalStructuredOutput,
} from "./grpc-agent-runtime-output-trust";

describe("Agent runtime gRPC wire codec", () => {
  it("preserves the pinned wire schema version", () => {
    expect(agentRuntimeWireSchemaVersion).toBe(1);
  });

  it("maps supported providers and preserves fail-closed health semantics", () => {
    expect(toGrpcProvider("codex")).toBe(AgentRuntimeProvider.AGENT_RUNTIME_PROVIDER_CODEX);
    expect(toGrpcProvider("claude")).toBe(AgentRuntimeProvider.AGENT_RUNTIME_PROVIDER_CLAUDE);
    expect(fromGrpcHealthStatus(AgentRuntimeHealthStatus.AGENT_RUNTIME_HEALTH_STATUS_SERVING))
      .toBe("serving");
    expect(fromGrpcHealthStatus(AgentRuntimeHealthStatus.AGENT_RUNTIME_HEALTH_STATUS_DEGRADED))
      .toBe("degraded");
    expect(fromGrpcHealthStatus(AgentRuntimeHealthStatus.UNRECOGNIZED))
      .toBe("not_serving");
  });

  it("rejects malformed usage and duration before exposing model accounting", () => {
    const usage = { inputTokens: 4, outputTokens: 3, totalTokens: 7, estimatedCostUsd: 0 };
    expect(readGrpcUsage(usage)).toEqual(usage);
    expect(readGrpcUsage(undefined)).toBeUndefined();
    expect(readOptionalDurationMs(undefined)).toBeUndefined();
    expect(readOptionalDurationMs(0)).toBe(0);
    for (const invalid of [
      { ...usage, inputTokens: -1 },
      { ...usage, outputTokens: 0.5 },
      { ...usage, totalTokens: 8 },
      { ...usage, totalTokens: Number.MAX_SAFE_INTEGER + 1 },
      { ...usage, estimatedCostUsd: Number.POSITIVE_INFINITY },
      { ...usage, estimatedCostUsd: Number.NaN },
    ]) {
      expect(() => readGrpcUsage(invalid)).toThrow("Agent runtime usage is malformed");
    }
    for (const invalid of [-1, 1.5, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => readOptionalDurationMs(invalid)).toThrow("Agent runtime duration is malformed");
    }
  });

  it("binds decoded runtime attestation to the original request, purpose, provider and output kind", () => {
    const command: AgentRuntimeTaskCommand = {
      requestId: "request-1",
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      correlationId: "correlation-1",
      provider: "codex",
      purpose: "social_monitor.reader_summary.generate",
      systemPrompt: "Return JSON.",
      prompt: "Summarize.",
      outputSchema: {},
      controls: {},
      timeoutMs: 1_000,
    };
    const response: AgentRuntimeTaskResponse = {
      schemaVersion: 1,
      status: AgentRuntimeTaskStatus.AGENT_RUNTIME_TASK_STATUS_COMPLETED,
      outputText: "",
      structuredOutputJson: "{}",
      warnings: [],
      usage: undefined,
      durationMs: undefined,
      failure: undefined,
      executionAttestation: {
        schemaVersion: 1,
        requestId: command.requestId,
        purpose: command.purpose,
        canonicalRequestSha256: "a".repeat(64),
        provider: AgentRuntimeProvider.AGENT_RUNTIME_PROVIDER_CODEX,
        model: "gpt-5.5",
        reasoningEffort: "xhigh",
        runtimeEngine: "subscription-runtime-cli",
        runtimePackageVersion: "0.1.0-main.2",
        launcherSha256: "b".repeat(64),
        selectedOutputKind: AgentRuntimeSelectedOutputKind.AGENT_RUNTIME_SELECTED_OUTPUT_KIND_STRUCTURED_OUTPUT,
        selectedOutputSha256: "c".repeat(64),
      },
    };
    expect(readExecutionAttestation(response, command)).toMatchObject({
      requestId: "request-1", provider: "codex", selectedOutputKind: "structured_output",
    });
    expect(readExecutionAttestation({ ...response, executionAttestation: undefined }, command))
      .toBeUndefined();
    expect(() => readExecutionAttestation({
      ...response,
      executionAttestation: { ...response.executionAttestation!, requestId: "foreign-request" },
    }, command)).toThrow("Agent runtime execution attestation is malformed");
    expect(() => readExecutionAttestation({
      ...response,
      executionAttestation: {
        ...response.executionAttestation!,
        provider: AgentRuntimeProvider.AGENT_RUNTIME_PROVIDER_UNSPECIFIED,
      },
    }, command)).toThrow("Attested agent runtime provider is unspecified");
    expect(() => readExecutionAttestation({
      ...response,
      executionAttestation: {
        ...response.executionAttestation!,
        selectedOutputKind: AgentRuntimeSelectedOutputKind.AGENT_RUNTIME_SELECTED_OUTPUT_KIND_UNSPECIFIED,
      },
    }, command)).toThrow("Attested agent runtime output kind is unspecified");
    expect(() => fromGrpcTaskResponse({ ...response, executionAttestation: undefined }, command))
      .toThrow("Completed agent runtime response has an invalid output attestation");
    expect(() => fromGrpcTaskResponse({
      ...response,
      status: AgentRuntimeTaskStatus.AGENT_RUNTIME_TASK_STATUS_FAILED,
    }, command)).toThrow("Non-completed agent runtime response must not be attested");
  });

  it("projects failure transport fields without changing original input or retry metadata", () => {
    const failure = Object.freeze({
      code: "UPSTREAM_UNAVAILABLE",
      safeMessage: "Upstream unavailable",
      retryable: true,
      reconnectRequired: false,
      causeCategory: "provider",
      details: "synthetic",
    });
    const wire = Object.freeze({ failure }) as unknown as AgentRuntimeTaskResponse;
    expect(readGrpcTaskFailure(wire)).toEqual(failure);
    expect(readGrpcTaskFailure(wire)).not.toBe(failure);
    expect(readGrpcTaskFailure({ failure: undefined } as AgentRuntimeTaskResponse))
      .toBeUndefined();
    expect(wire.failure).toBe(failure);
  });

  it("rejects non-object JSON roots while keeping optional text and JSON admission independent", () => {
    expect(readGrpcOptionalOutputText(" \t ")).toBeUndefined();
    expect(readGrpcOptionalOutputText("  cited text  ")).toBe("  cited text  ");
    expect(readGrpcOptionalStructuredOutput(" \n ")).toBeUndefined();
    const frozenJson = Object.freeze({ value: '{"source":"trusted","count":2}' });
    expect(readGrpcOptionalStructuredOutput(frozenJson.value)).toEqual({ source: "trusted", count: 2 });
    expect(frozenJson.value).toBe('{"source":"trusted","count":2}');
    for (const invalid of ["null", "[]", "true", "3", '"text"']) {
      expect(() => readGrpcOptionalStructuredOutput(invalid))
        .toThrow("Agent runtime structured output must be a JSON object");
    }
    expect(() => readGrpcOptionalStructuredOutput("{")).toThrow(SyntaxError);
  });
});
