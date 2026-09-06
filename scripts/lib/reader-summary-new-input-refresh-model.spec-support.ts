import type { CallOptions, ClientUnaryCall, Metadata, ServerUnaryCall, ServiceError } from "@grpc/grpc-js";
import {
  AgentRuntimeTaskRequest, AgentRuntimeTaskResponse, type AgentRuntimeServiceClient,
} from "@social-monitor/contracts/generated/grpc/agent_runtime/v1/agent_runtime";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { activeReaderSummaryPurposes as purposes } from "@social-monitor/summary/adapters/model/active-reader-summary-generation-profile";
import { GrpcAgentRuntimeClient } from "@social-monitor/summary/adapters/model/grpc-agent-runtime-client";
import type { AgentRuntimeTaskCommand } from "@social-monitor/summary/ports";
import { createAgentRuntimeGrpcService } from "../../apps/agent-runtime/src/agent-runtime-grpc-service";
import type { AgentRuntimeExecutionRequest, AgentRuntimeExecutorPort } from "../../apps/agent-runtime/src/agent-runtime-executor.port";
import { attachExecutorOwnedExecutionAttestation } from "../../apps/agent-runtime/src/subscription-runtime-execution-attestation";
import { admitSubscriptionRuntimeRequest } from "../../apps/agent-runtime/src/subscription-runtime-purpose-model-policy";
import { refreshManifest, refreshNow } from "./reader-summary-new-input-refresh.spec-support";

export const refreshModelCommand = (purpose: string = purposes.generate): AgentRuntimeTaskCommand => ({
  requestId: purpose, purpose, correlationId: "synthetic-request-binding",
  tenantId: tenantId(refreshManifest().tenantId), workspaceId: workspaceId(refreshManifest().workspaceId),
  provider: "codex", prompt: "Synthetic prompt", systemPrompt: "Synthetic instruction",
  outputSchema: {}, timeoutMs: 1000, controls: {
    model: "gpt-5.6-sol", reasoningEffort: "high",
    ...(purpose === purposes.relatedTopicRelations ? {
      outputSchemaName: "social_monitor_reader_summary_related_topic_relations",
      schemaVersion: "reader_summary.related_topic_relation.v1",
    } : {}),
  },
  metadata: { attempt: "primary", ...(purpose === purposes.relatedTopicRelations
    ? { taskRole: "related_topic_relation", verificationLane: "related_topic" } : {}) },
});

// Exercise the real client serialization, protobuf defaults, service translation,
// admission and executor-owned attestation without a socket, process or provider.
export function refreshTestRuntimeClient(execute: AgentRuntimeExecutorPort["execute"]) {
  const service = createAgentRuntimeGrpcService({ execute,
    checkHealth: async () => { throw new Error("Synthetic transport has no health endpoint"); },
  }, {});
  const transport = {
    runAgentTask(request: AgentRuntimeTaskRequest, metadata: Metadata, _options: CallOptions,
      callback: (error: ServiceError | null, response: AgentRuntimeTaskResponse) => void): ClientUnaryCall {
      service.runAgentTask({
        request: AgentRuntimeTaskRequest.decode(AgentRuntimeTaskRequest.encode(request).finish()), metadata,
      } as ServerUnaryCall<AgentRuntimeTaskRequest, AgentRuntimeTaskResponse>, (error, response) => {
        callback(error as ServiceError | null, response == null ? response as never
          : AgentRuntimeTaskResponse.decode(AgentRuntimeTaskResponse.encode(response).finish()));
      });
      return { cancel: () => undefined } as ClientUnaryCall;
    },
  } as unknown as AgentRuntimeServiceClient;
  return new GrpcAgentRuntimeClient(transport, { now: () => refreshNow }, { timeoutMs: 1000 });
}

export async function attestRefreshExecution(request: AgentRuntimeExecutionRequest,
  structuredOutput: Record<string, unknown> = { groups: [] }) {
  const admission = admitSubscriptionRuntimeRequest(request);
  const runtime = refreshManifest().runtime;
  const installation = { executablePath: "/synthetic/runtime", packageRootRealpath: "/synthetic",
    runtimePackageVersion: runtime.packageVersion, launcherSha256: runtime.launcherSha256 };
  return attachExecutorOwnedExecutionAttestation({ command: installation.executablePath, request,
    ...admission, admittedInstallation: installation,
    installationInspector: { inspect: async () => installation },
    result: { status: "completed", warnings: [], structuredOutput,
      usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5, estimatedCostUsd: 0 } },
  });
}

export function completedRefreshModelRequest(command: AgentRuntimeTaskCommand,
  structuredOutput?: Record<string, unknown>) {
  return refreshTestRuntimeClient((request) => attestRefreshExecution(request, structuredOutput)).runTask(command);
}
