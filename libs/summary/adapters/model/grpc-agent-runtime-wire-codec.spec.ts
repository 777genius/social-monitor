import {
  AgentRuntimeHealthStatus,
  AgentRuntimeProvider,
} from "@social-monitor/contracts/generated/grpc/agent_runtime/v1/agent_runtime";
import {
  agentRuntimeWireSchemaVersion,
  fromGrpcHealthStatus,
  toGrpcProvider,
} from "./grpc-agent-runtime-wire-codec";

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
});
