import type { ClientUnaryCall } from "@grpc/grpc-js";
import type { AgentRuntimeServiceClient } from "@social-monitor/contracts/generated/grpc/agent_runtime/v1/agent_runtime";
import {
  createGrpcDeadline,
  createGrpcRequestMetadata,
} from "@social-monitor/platform-grpc";
import type { Clock } from "@social-monitor/shared-kernel";
import type { AgentRuntimeTaskCommand, AgentRuntimeTaskResult } from "../../ports";
import {
  agentRuntimeWireSchemaVersion,
  fromGrpcTaskResponse,
  toGrpcProvider,
} from "./grpc-agent-runtime-wire-codec";

const taskTransportGraceMs = 5_000;

export const agentRuntimeTaskDeadlineTimeoutMs = (
  taskTimeoutMs: number,
): number => taskTimeoutMs + taskTransportGraceMs;

/**
 * Owns the unary task lifecycle, including cancellation before the gRPC
 * client has returned its call handle. Decoding stays fail-closed through
 * the canonical wire codec before any result can settle successfully.
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
  // A signal can change during a synchronous SDK call even when TS narrows it.
  const hasAborted = (): boolean => signal?.aborted === true;
  if (hasAborted()) {
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

  return new Promise((resolve, reject) => {
    let call: ClientUnaryCall | undefined;
    let settled = false;
    let cancellationRequested = false;
    let transportCancelled = false;
    const finish = (complete: () => void): void => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      complete();
    };
    const cancelTransport = (): void => {
      if (call === undefined || transportCancelled) return;
      transportCancelled = true;
      try {
        call.cancel();
      } catch {
        // The cancellation rejection has priority over a throwing transport.
      }
    };
    const abort = (): void => {
      cancellationRequested = true;
      finish(() => reject(new Error("Agent runtime gRPC task was cancelled")));
      cancelTransport();
    };
    signal?.addEventListener("abort", abort, { once: true });
    if (hasAborted()) {
      abort();
      return;
    }

    try {
      call = params.client.runAgentTask(
        {
          schemaVersion: agentRuntimeWireSchemaVersion,
          requestId: command.requestId,
          tenantId: String(command.tenantId),
          workspaceId: String(command.workspaceId),
          correlationId: command.correlationId,
          provider: toGrpcProvider(command.provider),
          providerInstanceId: command.providerInstanceId ?? "",
          purpose: command.purpose,
          systemPrompt: command.systemPrompt,
          prompt: command.prompt,
          outputSchemaJson: JSON.stringify(command.outputSchema),
          controlsJson: JSON.stringify(command.controls),
          timeoutMs: command.timeoutMs,
          cwd: command.cwd ?? params.defaultCwd ?? "",
          metadata: command.metadata ?? {},
        },
        metadata,
        { deadline },
        (error, response) => {
          if (settled) return;
          if (error !== null) {
            finish(() => reject(error));
            return;
          }
          try {
            const result = fromGrpcTaskResponse(response, command);
            finish(() => resolve(result));
          } catch (parseError) {
            finish(() => reject(parseError));
          }
        },
      );
      // An abort triggered inside the transport before it returns a call
      // handle must still cancel the actual in-flight operation.
      if (cancellationRequested || hasAborted()) {
        if (!cancellationRequested) abort();
        else cancelTransport();
      }
    } catch (error) {
      finish(() => reject(error));
    }
  });
};
