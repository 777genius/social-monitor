import type { AgentRuntimeServiceClient } from "@social-monitor/contracts/generated/grpc/agent_runtime/v1/agent_runtime";
import {
  createGrpcDeadline,
  createGrpcRequestMetadata,
} from "@social-monitor/platform-grpc";
import type { Clock } from "@social-monitor/shared-kernel";
import type { AgentRuntimeTaskCommand, AgentRuntimeTaskResult } from "../../ports";
import { fromGrpcTaskResponse } from "./grpc-agent-runtime-wire-codec";
import { buildGrpcAgentRuntimeTaskRequest } from "./grpc-agent-runtime-task-request";
import { runGrpcAgentRuntimeTaskLifecycle } from "./grpc-agent-runtime-task-lifecycle";

const taskTransportGraceMs = 5_000;

export const agentRuntimeTaskDeadlineTimeoutMs = (
  taskTimeoutMs: number,
): number => taskTimeoutMs + taskTransportGraceMs;

/**
 * Owns the scoped transport admission, metadata and bounded deadline.
 * The unary lifecycle manages cancellation; the wire codec remains the
 * only authority that accepts attested task output.
 */
export const invokeGrpcAgentRuntimeTask = (params: {
  readonly client: AgentRuntimeServiceClient;
  readonly clock: Clock;
  readonly command: AgentRuntimeTaskCommand;
  readonly defaultCwd: string | undefined;
  readonly serviceToken: string | undefined;
  readonly signal: AbortSignal | undefined;
}): Promise<AgentRuntimeTaskResult> => {
  const { command, signal } = params;
  if (signal?.aborted === true) {
    return Promise.reject(new Error("Agent runtime gRPC task was cancelled"));
  }
  const metadata = createGrpcRequestMetadata({
    correlationId: command.correlationId,
    serviceToken: params.serviceToken,
  });
  const deadline = createGrpcDeadline(
    params.clock,
    agentRuntimeTaskDeadlineTimeoutMs(command.timeoutMs),
  );

  return runGrpcAgentRuntimeTaskLifecycle({
    signal,
    dispatch: (callback) => params.client.runAgentTask(
      buildGrpcAgentRuntimeTaskRequest(command, params.defaultCwd),
      metadata,
      { deadline },
      callback,
    ),
    decode: (response) => fromGrpcTaskResponse(response, command),
  });
};
