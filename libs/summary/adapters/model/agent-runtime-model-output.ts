import type { AgentRuntimeTaskResult } from "../../ports";
import { AgentRuntimeModelProviderError } from "./agent-runtime-model-failure";
import { mapAgentRuntimeFailure } from "./agent-runtime-model-task-failure";

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
    try {
      return parseOutputText(result.outputText);
    } catch (error) {
      // JSON parser diagnostics can quote provider text in persisted failures.
      if (error instanceof SyntaxError) {
        throw new SyntaxError(`${label} output must be valid JSON`);
      }
      throw error;
    }
  }

  throw new AgentRuntimeModelProviderError({
    kind: "unsafe_or_refused",
    retryable: false,
    message: `${label} agent task returned no structured output`,
  });
};
