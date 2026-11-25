import type { AgentRuntimeTaskResponse } from "@social-monitor/contracts/generated/grpc/agent_runtime/v1/agent_runtime";
import type { AgentRuntimeTaskResult } from "../../ports";

/** Keep provider failure wire projection independent of the response trust policy. */
export const readGrpcTaskFailure = (
  response: AgentRuntimeTaskResponse,
): AgentRuntimeTaskResult["failure"] =>
  response.failure === undefined
    ? undefined
    : {
        code: response.failure.code,
        safeMessage: response.failure.safeMessage,
        retryable: response.failure.retryable,
        reconnectRequired: response.failure.reconnectRequired,
        causeCategory: response.failure.causeCategory,
        details: response.failure.details,
      };
