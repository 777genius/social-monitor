import type {
  AgentRuntimeExecutionLifecycle,
  AgentRuntimeExecutionRequest,
  AgentRuntimeExecutionResult,
  AgentRuntimeExecutorPort,
} from "./agent-runtime-executor.port";

// This is outstanding execution ownership, not a capacity scheduler. Independent
// executions reach the existing account pool and its account-specific capacity
// fences. Caller cancellation cannot remove ownership or release pool capacity.
export const assessmentExecutionWithLease = (executor: AgentRuntimeExecutorPort) => {
  const outstanding = new Map<string, object>();
  return async (request: AgentRuntimeExecutionRequest): Promise<AgentRuntimeExecutionResult> => {
    if (request.purpose !== "social_monitor.relevance.assess_source_content.v1") {
      return executor.execute(request);
    }
    const key = JSON.stringify([request.tenantId, request.workspaceId, request.requestId]);
    if (outstanding.has(key)) return { status: "failed", warnings: [], failure: {
      code: "assessment_execution_leased", safeMessage: "Assessment execution remains occupied",
      retryable: false, reconnectRequired: false, causeCategory: "capacity", details: {},
    } };
    const ownership = {};
    outstanding.set(key, ownership);
    let settled = false;
    let lifecycle: AgentRuntimeExecutionLifecycle | undefined;
    const releaseIfKnown = () => {
      if (settled && (lifecycle === "not_started" || lifecycle === "terminal") &&
          outstanding.get(key) === ownership) outstanding.delete(key);
    };
    try {
      const result = await executor.execute(request, (evidence) => {
        lifecycle = evidence;
        releaseIfKnown();
      });
      // Executors without lifecycle reporting retain the existing terminal-result
      // contract. Explicit indeterminate evidence overrides a returned failure.
      lifecycle ??= "terminal";
      return result;
    } finally {
      settled = true;
      releaseIfKnown();
    }
  };
};
