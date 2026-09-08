import type { Clock } from "@social-monitor/shared-kernel";
import type { AgentRuntimeClientPort } from "../../ports";
import { GrpcAgentRuntimeClient } from "../../adapters/model/grpc-agent-runtime-client";
import { resolveAgentRuntimeReaderSummaryModelOptions } from "../../adapters/model/agent-runtime-reader-summary-model.adapter";
import { resolveAgentRuntimeReaderSummaryStoryRelationVerifierOptions } from "../../adapters/model/agent-runtime-reader-summary-story-relation-verifier.adapter";
import { resolveSummaryAgentRuntimeClientOptions } from "./summary-agent-runtime-provider-tokens";

// Reuse the scheduled runtime's endpoint, identity and established task budgets.
// A supplied capture client is reused; REST connects to the same hosted pool.
export const createSourceAssessmentRuntime = (input: {
  readonly env: NodeJS.ProcessEnv;
  readonly clock: Clock;
  readonly client?: AgentRuntimeClientPort;
}) => {
  const client = input.client ?? GrpcAgentRuntimeClient.connect({
    address: resolveSummaryAgentRuntimeClientOptions(input.env, { requireAddress: true }).address,
    clock: input.clock,
    options: resolveSummaryAgentRuntimeClientOptions(input.env, { requireAddress: true }),
  });
  const summary = resolveAgentRuntimeReaderSummaryModelOptions(input.env, client);
  const relation = resolveAgentRuntimeReaderSummaryStoryRelationVerifierOptions(input.env, client);
  const totalTimeoutMs = Math.min(summary.timeoutMs ?? 600_000, 600_000);
  return { client, providerInstanceId: summary.providerInstanceId,
    totalTimeoutMs, batchTimeoutMs: Math.min(relation.timeoutMs ?? 300_000, totalTimeoutMs) };
};
