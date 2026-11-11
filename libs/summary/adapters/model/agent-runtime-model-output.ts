import type { AgentRuntimeTaskResult } from "../../ports";
import {
  AgentRuntimeModelProviderError,
  mapAgentRuntimeFailure,
} from "./agent-runtime-model-failure";

export const readAgentRuntimeObjectOutput = (
  result: AgentRuntimeTaskResult,
  parseOutputText: (value: string) => Record<string, unknown>,
  label: string,
): Record<string, unknown> => {
  if (result.status === "waiting_for_input") {
    throw new AgentRuntimeModelProviderError({
      kind: "unsafe_or_refused",
      retryable: false,
      message: `${label} agent task requested interactive input`,
    });
  }

  if (result.status === "failed") {
    throw new AgentRuntimeModelProviderError(
      mapAgentRuntimeFailure(result.failure, `${label} agent task failed`),
    );
  }

  if (result.structuredOutput !== undefined) {
    return result.structuredOutput;
  }

  if (result.outputText !== undefined) {
    return parseOutputText(result.outputText);
  }

  throw new AgentRuntimeModelProviderError({
    kind: "unsafe_or_refused",
    retryable: false,
    message: `${label} agent task returned no structured output`,
  });
};
