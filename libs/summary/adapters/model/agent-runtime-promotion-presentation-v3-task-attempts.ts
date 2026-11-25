import type {
  AgentRuntimeClientPort,
  AgentRuntimeTaskCommand,
  AgentRuntimeTaskResult,
} from "../../ports";
import { presentationRuntimeFailureDisposition } from "./agent-runtime-promotion-presentation-v3-runtime-failure";

/**
 * Owns the only retryable paid presentation transport boundary.
 * An ambiguous dispatch, validation failure, or run-wide rejection never
 * authorizes replay. A permitted retry uses the identical task command.
 */
export const runPromotionPresentationTaskAttempts = async (
  client: AgentRuntimeClientPort,
  command: AgentRuntimeTaskCommand,
): Promise<AgentRuntimeTaskResult> => {
  let result = await client.runTask(command);
  // A transient runtime failure (cancellation, crashed run, empty failure,
  // timeout) says nothing about the stories on either backend: resend the same
  // request once unless it already used its deadline (a runtime that has
  // exhausted this request answers at once), then skip only this batch under
  // its own runtime_failure reason. The promotion run discloses the gap and
  // stops when runtime failures repeat.
  if (presentationRuntimeFailureDisposition(result) === "retry") {
    result = await client.runTask(command);
  }
  return result;
};
