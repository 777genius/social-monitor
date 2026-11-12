import { invokeGrpcAgentRuntimeHealthCheck } from "./grpc-agent-runtime-health-check";
import { invokeGrpcAgentRuntimeTask } from "./grpc-agent-runtime-task-invocation";
export { agentRuntimeTaskDeadlineTimeoutMs } from "./grpc-agent-runtime-task-invocation";

import {
  credentials,
  type ChannelCredentials,
} from "@grpc/grpc-js";
import { isAbsolute, normalize } from "node:path";
import {
  AgentRuntimeServiceClient,
} from "@social-monitor/contracts/generated/grpc/agent_runtime/v1/agent_runtime";
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
    return invokeGrpcAgentRuntimeTask({
      client: this.client,
      clock: this.clock,
      command,
      defaultCwd: this.options.defaultCwd,
      serviceToken: this.options.serviceToken,
      signal: options?.signal,
    });
  }

  async checkHealth(service: string): Promise<AgentRuntimeHealthResult> {
    return invokeGrpcAgentRuntimeHealthCheck({
      client: this.client,
      clock: this.clock,
      service,
      serviceToken: this.options.serviceToken,
      timeoutMs: this.options.timeoutMs,
    });
  }
}

