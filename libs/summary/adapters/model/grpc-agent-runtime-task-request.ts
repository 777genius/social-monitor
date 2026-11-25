import { isAbsolute, normalize } from "node:path";
import type { AgentRuntimeTaskRequest } from "@social-monitor/contracts/generated/grpc/agent_runtime/v1/agent_runtime";
import type { AgentRuntimeTaskCommand } from "../../ports";
import {
  agentRuntimeWireSchemaVersion,
  toGrpcProvider,
} from "./grpc-agent-runtime-wire-codec";

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

/** Projects scoped task identity and inputs to the gRPC request without transport side effects. */
export const buildGrpcAgentRuntimeTaskRequest = (
  command: AgentRuntimeTaskCommand,
  defaultCwd: string | undefined,
): AgentRuntimeTaskRequest => ({
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
  cwd: command.cwd ?? defaultCwd ?? "",
  metadata: command.metadata ?? {},
});
