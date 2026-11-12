import type { AgentRuntimeServiceClient } from "@social-monitor/contracts/generated/grpc/agent_runtime/v1/agent_runtime";
import { createGrpcDeadline, createGrpcRequestMetadata } from "@social-monitor/platform-grpc";
import type { Clock } from "@social-monitor/shared-kernel";

import type { AgentRuntimeHealthResult } from "../../ports";
import { fromGrpcHealthStatus } from "./grpc-agent-runtime-wire-codec";

/**
 * The health RPC owns its own metadata, deadline and response translation.
 * It never participates in task cancellation or execution attestation.
 */
export const invokeGrpcAgentRuntimeHealthCheck = async (params: Readonly<{
  client: AgentRuntimeServiceClient;
  clock: Clock;
  service: string;
  serviceToken: string | undefined;
  timeoutMs: number;
}>): Promise<AgentRuntimeHealthResult> => {
  const { client, clock, service, serviceToken, timeoutMs } = params;
  const metadata = createGrpcRequestMetadata({
    correlationId: `agent-runtime-health:${service}`,
    serviceToken,
  });
  const deadline = createGrpcDeadline(clock, timeoutMs);

  return new Promise((resolve, reject) => {
    client.checkHealth(
      { service },
      metadata,
      { deadline },
      (error, response) => {
        if (error !== null) {
          reject(error);
          return;
        }

        try {
          resolve({
            status: fromGrpcHealthStatus(response.status),
            runtimeEngine: response.runtimeEngine,
            runtimeVersion: response.runtimeVersion,
            launcherSha256:
              response.launcherSha256.trim().length > 0
                ? response.launcherSha256
                : undefined,
            warnings: response.warnings.map((warning) => ({
              code: warning.code,
              message: warning.message,
            })),
          });
        } catch (parseError) {
          reject(parseError);
        }
      },
    );
  });
};
