import type { Metadata } from "@grpc/grpc-js";
import {
  AgentRuntimeHealthStatus,
  type AgentRuntimeServiceClient,
} from "@social-monitor/contracts/generated/grpc/agent_runtime/v1/agent_runtime";

import { GrpcAgentRuntimeClient } from "./grpc-agent-runtime-client";

type HealthReply = (error: Error | null, response: unknown) => void;

const fixtureHealth = (overrides: Record<string, unknown> = {}) => ({
  status: AgentRuntimeHealthStatus.AGENT_RUNTIME_HEALTH_STATUS_SERVING,
  runtimeEngine: "subscription-runtime-cli",
  runtimeVersion: "0.1.0-main.2",
  launcherSha256: "a".repeat(64),
  warnings: [{ code: "fixture-warning", message: "synthetic" }],
  ...overrides,
});

const clock = { now: () => new Date("2026-07-17T00:00:00.000Z") };

const clientForHealth = (
  reply: (callback: HealthReply) => void,
  capture?: (request: { service: string }, metadata: Metadata, deadline: Date) => void,
  serviceToken?: string,
): GrpcAgentRuntimeClient => {
  const transport = {
    checkHealth(
      request: { service: string },
      metadata: Metadata,
      options: { deadline: Date },
      callback: HealthReply,
    ): void {
      capture?.(request, metadata, options.deadline);
      reply(callback);
    },
  } as unknown as AgentRuntimeServiceClient;
  return new GrpcAgentRuntimeClient(transport, clock, {
    timeoutMs: 1_500,
    serviceToken,
  });
};

describe("gRPC Agent Runtime health boundary", () => {
  it("preserves the scoped service, bearer metadata and independent health deadline", async () => {
    const serviceToken = ["synthetic", "health", "credential"].join("-");
    const captured: { service?: string; metadata?: Metadata; deadline?: Date } = {};
    const client = clientForHealth(
      (reply) => reply(null, fixtureHealth()),
      (request, metadata, deadline) => {
        captured.service = request.service;
        captured.metadata = metadata;
        captured.deadline = deadline;
      },
      serviceToken,
    );

    await expect(client.checkHealth("runtime")).resolves.toEqual({
      status: "serving",
      runtimeEngine: "subscription-runtime-cli",
      runtimeVersion: "0.1.0-main.2",
      launcherSha256: "a".repeat(64),
      warnings: [{ code: "fixture-warning", message: "synthetic" }],
    });
    expect(captured.service).toBe("runtime");
    expect(captured.metadata?.get("x-correlation-id")).toEqual([
      "agent-runtime-health:runtime",
    ]);
    expect(captured.metadata?.get("authorization")).toEqual([
      `Bearer ${serviceToken}`,
    ]);
    expect(captured.deadline).toEqual(new Date("2026-07-17T00:00:01.500Z"));
  });

  it.each([
    [AgentRuntimeHealthStatus.AGENT_RUNTIME_HEALTH_STATUS_DEGRADED, "degraded"],
    [AgentRuntimeHealthStatus.AGENT_RUNTIME_HEALTH_STATUS_UNSPECIFIED, "not_serving"],
    [AgentRuntimeHealthStatus.UNRECOGNIZED, "not_serving"],
  ])("normalizes the wire status %s while leaving empty launcher SHA absent", async (status, expected) => {
    const client = clientForHealth(
      (reply) => reply(null, fixtureHealth({ status, launcherSha256: "" })),
    );
    await expect(client.checkHealth("runtime")).resolves.toMatchObject({
      status: expected,
      launcherSha256: undefined,
      warnings: [{ code: "fixture-warning", message: "synthetic" }],
    });
  });

  it("propagates gRPC transport failures without trusting a response", async () => {
    const client = clientForHealth(
      (reply) => reply(new Error("synthetic health transport failure"), fixtureHealth()),
    );
    await expect(client.checkHealth("runtime")).rejects.toThrow(
      "synthetic health transport failure",
    );
  });

  it("rejects a malformed wire warning collection instead of returning health success", async () => {
    const client = clientForHealth(
      (reply) => reply(null, fixtureHealth({ warnings: null })),
    );
    await expect(client.checkHealth("runtime")).rejects.toThrow();
  });
});
