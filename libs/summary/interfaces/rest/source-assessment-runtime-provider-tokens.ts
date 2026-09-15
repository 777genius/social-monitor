import type { Clock } from "@social-monitor/shared-kernel";
import type { AgentRuntimeClientPort } from "../../ports";
import { GrpcAgentRuntimeClient } from "../../adapters/model/grpc-agent-runtime-client";
import { parsePositiveInteger } from "../../adapters/model/agent-runtime-model-support";
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
  // The operation spans multiple batches; retain the adapter's separate limits.
  const totalTimeoutMs = Math.min(
    parsePositiveInteger(
      input.env.AGENT_RUNTIME_SOURCE_CONTENT_ASSESSMENT_TOTAL_TIMEOUT_MS,
    ) ??
      summary.timeoutMs ?? 600_000,
    3_600_000,
  );
  return { client, providerInstanceId: summary.providerInstanceId,
    totalTimeoutMs, batchTimeoutMs: Math.min(relation.timeoutMs ?? 300_000, totalTimeoutMs, 600_000) };
};
