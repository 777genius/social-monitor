import { agentRuntimeTaskDeadlineTimeoutMs } from "./grpc-agent-runtime-client";

describe("gRPC agent runtime task deadline", () => {
  it("keeps transport open long enough to receive a typed task timeout", () => {
    expect(agentRuntimeTaskDeadlineTimeoutMs(600_000)).toBe(605_000);
  });
});
