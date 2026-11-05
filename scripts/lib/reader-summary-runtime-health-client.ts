import { createReaderSummaryAgentRuntimeClient } from "@social-monitor/summary/adapters/composition/reader-summary-agent-runtime-transport";
import { GrpcAgentRuntimeClient } from "@social-monitor/summary/adapters/model/grpc-agent-runtime-client";
import { resolveReaderSummaryAgentRuntimeTransport } from "@social-monitor/summary/interfaces/rest/summary-agent-runtime-provider-tokens";
import type { AgentRuntimeClientPort } from "@social-monitor/summary/ports";
import { CryptoIdGenerator, SystemClock } from "@social-monitor/shared-kernel";

/**
 * Health client of the transport the capture child will use, so the live
 * runtime identity binds the executor that produced the attestations: the
 * CLI runtime over gRPC, or the vendored gateway SDK.
 */
export const connectReaderSummaryRuntimeHealthClient = (
  env: NodeJS.ProcessEnv,
  grpcTimeoutMs: number,
): Pick<AgentRuntimeClientPort, "checkHealth"> => createReaderSummaryAgentRuntimeClient({
  transport: resolveReaderSummaryAgentRuntimeTransport(env),
  env,
  clock: new SystemClock(),
  runId: new CryptoIdGenerator().generate(),
  agentRuntime: () => {
    const address = env.AGENT_RUNTIME_GRPC_ADDRESS?.trim();
    if (address === undefined || address.length === 0) {
      throw new Error("AGENT_RUNTIME_GRPC_ADDRESS is required for runtime proof");
    }
    return GrpcAgentRuntimeClient.connect({
      address,
      clock: new SystemClock(),
      options: {
        timeoutMs: grpcTimeoutMs,
        serviceToken: env.AGENT_RUNTIME_SERVICE_TOKEN?.trim() || undefined,
      },
    });
  },
});
