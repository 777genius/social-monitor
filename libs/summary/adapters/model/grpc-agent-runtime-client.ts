import {
  agentRuntimeWireSchemaVersion,
  fromGrpcHealthStatus,
  fromGrpcTaskResponse,
  toGrpcProvider,
} from "./grpc-agent-runtime-wire-codec";

import {
  credentials,
  type ChannelCredentials,
  type ClientUnaryCall,
} from "@grpc/grpc-js";
import { isAbsolute, normalize } from "node:path";
import {
  AgentRuntimeServiceClient,
} from "@social-monitor/contracts/generated/grpc/agent_runtime/v1/agent_runtime";
import {
  createGrpcDeadline,
  createGrpcRequestMetadata,
} from "@social-monitor/platform-grpc";
import type { Clock } from "@social-monitor/shared-kernel";

import type {
  AgentRuntimeClientPort,
  AgentRuntimeHealthResult,
  AgentRuntimeTaskCommand,
  AgentRuntimeTaskResult,
} from "../../ports";

export type GrpcAgentRuntimeClientOptions = {
  readonly timeoutMs: number;
  readonly serviceToken?: string;
  readonly defaultCwd?: string;
};

export const validateAgentRuntimeDefaultCwd = (value: string): string => {
  if (
    value.length === 0 || value !== value.trim() ||
    value.includes("\0") || !isAbsolute(value) || normalize(value) !== value ||
    (value !== "/" && value.endsWith("/"))
  ) {
    throw new Error("Agent runtime default cwd must be a lexical absolute path");
  }
  return value;
};

const taskTransportGraceMs = 5_000;

export const agentRuntimeTaskDeadlineTimeoutMs = (
  taskTimeoutMs: number,
): number => taskTimeoutMs + taskTransportGraceMs;

export class GrpcAgentRuntimeClient implements AgentRuntimeClientPort {
  static connect(params: {
    readonly address: string;
    readonly clock: Clock;
    readonly options: GrpcAgentRuntimeClientOptions;
    readonly credentials?: ChannelCredentials;
  }): GrpcAgentRuntimeClient {
    return new GrpcAgentRuntimeClient(
      new AgentRuntimeServiceClient(
        params.address,
        params.credentials ?? credentials.createInsecure(),
      ),
      params.clock,
      params.options,
    );
  }

  constructor(
    private readonly client: AgentRuntimeServiceClient,
    private readonly clock: Clock,
    private readonly options: GrpcAgentRuntimeClientOptions,
  ) {
    if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1) {
      throw new Error("Agent runtime gRPC timeout must be a positive integer");
    }
    if (options.defaultCwd !== undefined) {
      validateAgentRuntimeDefaultCwd(options.defaultCwd);
    }
  }

  async runTask(
    command: AgentRuntimeTaskCommand,
    options?: { readonly signal?: AbortSignal },
  ): Promise<AgentRuntimeTaskResult> {
    if (options?.signal?.aborted === true) {
      throw new Error("Agent runtime gRPC task was cancelled");
    }
    const metadata = createGrpcRequestMetadata({
      correlationId: command.correlationId,
      serviceToken: this.options.serviceToken,
    });
    const deadline = createGrpcDeadline(
      this.clock,
      agentRuntimeTaskDeadlineTimeoutMs(command.timeoutMs),
    );

    return new Promise((resolve, reject) => {
      const callState: { value?: ClientUnaryCall } = {};
      let settled = false;
      const finish = (complete: () => void): void => {
        if (settled) return;
        settled = true;
        if (options?.signal !== undefined) {
          options.signal.removeEventListener("abort", abort);
        }
        complete();
      };
      const abort = (): void => {
        callState.value?.cancel();
        finish(() => reject(new Error("Agent runtime gRPC task was cancelled")));
      };
      options?.signal?.addEventListener("abort", abort, { once: true });
      callState.value = this.client.runAgentTask(
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
          cwd: command.cwd ?? this.options.defaultCwd ?? "",
          metadata: command.metadata ?? {},
        },
        metadata,
        { deadline },
        (error, response) => {
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
      if (options?.signal?.aborted === true) abort();
    });
  }

  async checkHealth(service: string): Promise<AgentRuntimeHealthResult> {
    const metadata = createGrpcRequestMetadata({
      correlationId: `agent-runtime-health:${service}`,
      serviceToken: this.options.serviceToken,
    });
    const deadline = createGrpcDeadline(this.clock, this.options.timeoutMs);

    return new Promise((resolve, reject) => {
      this.client.checkHealth(
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
  }
}

