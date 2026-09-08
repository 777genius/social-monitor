import type { AgentRuntimeExecutionRequest, AgentRuntimeExecutionResult,
  AgentRuntimeExecutorPort } from "./agent-runtime-executor.port";

// One assessment execution per hosted service, shared by all connections and
// operations. Cancellation quarantines the lease until the executor actually
// settles; a disconnected caller cannot start overlapping queued/running work.
// Other purposes retain their existing scheduling contracts.
export const assessmentExecutionWithLease = (executor: AgentRuntimeExecutorPort) => {
  let leased = false;
  return async (request: AgentRuntimeExecutionRequest): Promise<AgentRuntimeExecutionResult> => {
    if (request.purpose !== "social_monitor.relevance.assess_source_content.v1") {
      return executor.execute(request);
    }
    if (leased) return { status: "failed", warnings: [], failure: {
      code: "assessment_execution_leased", safeMessage: "Assessment execution remains occupied",
      retryable: false, reconnectRequired: false, causeCategory: "capacity", details: {},
    } };
    leased = true;
    // A thrown transport/executor error does not prove remote termination.
    // Retain the single lease in that case; no timer may declare it released.
    const result = await executor.execute(request);
    leased = false;
    return result;
  };
};
