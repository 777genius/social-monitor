import { LlmSchemaError, prepareStrictJsonSchema } from "@agent-teams/account-gateway/llm";
import type { LlmTask } from "@agent-teams/account-gateway/llm";

import type { AgentRuntimeFailure, AgentRuntimeTaskCommand } from "../../../ports";
import { codexReaderSummaryBackend, gatewayDefaultReasoningEffort } from "../active-reader-summary-generation-profile";
import type { GatewayLlmClientOptions, GatewayLlmRoute } from "./gateway-llm-client";
import { gatewayLlmLocalFailure, type GatewayLlmOutputViolations } from "./gateway-llm-failure";
import { toGatewayOutputSchema } from "./gateway-llm-output-schema";
import { collectOutputViolations } from "./gateway-llm-output-violations";
import { gatewayLlmDeadline } from "./gateway-llm-deadline";
import { gatewayLlmOutputBytes } from "./gateway-llm-output-budget";

type PreparedTask = Omit<LlmTask<Record<string, unknown>>, "taskId" | "attempt" | "accountRefs">;
export type GatewayLlmPrepared = {
  readonly task: PreparedTask;
  readonly route: GatewayLlmRoute;
  readonly reasoningEffort: string;
  readonly structured: boolean;
  /** Where the last decoded output broke the schema, as safe path:keyword entries. */
  readonly outputViolations: () => GatewayLlmOutputViolations | undefined;
};

/** Validate the requested route and prepare provider SDK output decoding before dispatch.
 * Neither task identity nor an account is selected until this succeeds.
 */
export const prepareGatewayLlmTask = (
  command: AgentRuntimeTaskCommand,
  startedAt: number,
  options: Pick<GatewayLlmClientOptions, "route" | "policy">,
): GatewayLlmPrepared | { readonly failure: AgentRuntimeFailure } => {
  const route = options.route;
  const controls = command.controls;
  // Codex tasks name no modelBackend; every other backend names itself.
  if (controls.model !== route.model ||
      (controls.modelBackend ?? codexReaderSummaryBackend) !== route.modelBackend) {
    return { failure: gatewayLlmLocalFailure("unsupported_route",
      "Gateway has no route for the requested model") };
  }
  if (controls.reasoningEffort !== route.reasoningEffort) {
    return { failure: gatewayLlmLocalFailure("invalid_request",
      "Gateway task reasoning effort conflicts with the route policy") };
  }
  if (command.systemPrompt.trim().length === 0 || !(command.timeoutMs > 0)) {
    return { failure: gatewayLlmLocalFailure("invalid_request",
      "Gateway task requires instructions and a positive timeout") };
  }
  const structured = Object.keys(command.outputSchema).length > 0;
  let output: PreparedTask["output"] = { mode: "text" };
  let decode: PreparedTask["decode"];
  let violations: GatewayLlmOutputViolations | undefined;
  if (structured) {
    // Strict providers need every property required and objects closed;
    // decode strips the added nulls and validates the original schema, so
    // a provider that ignores the schema still cannot pass invalid output.
    try {
      const gatewaySchema = toGatewayOutputSchema(command.outputSchema);
      const strict = prepareStrictJsonSchema(gatewaySchema);
      output = { mode: "json_schema", schema: strict.schema, strict: true };
      decode = (value) => {
        violations = undefined;
        try {
          return objectOutput(strict.decode(value));
        } catch (error) {
          // The decode names the first violation; a repair needs all of them.
          violations = { first: error instanceof LlmSchemaError ? error.detail : "not_an_object",
            all: collectOutputViolations(gatewaySchema, value) };
          throw error;
        }
      };
    } catch (error) {
      if (!(error instanceof LlmSchemaError)) throw error;
      return { failure: gatewayLlmLocalFailure("invalid_schema",
        "Gateway task output schema is not supported") };
    }
  }
  const requested = controls.maxOutputTokens;
  return {
    route,
    structured,
    outputViolations: () => violations,
    reasoningEffort: route.reasoningEffort ?? gatewayDefaultReasoningEffort,
    task: {
      profileId: route.profileId,
      model: route.model,
      policy: options.policy,
      instructions: command.systemPrompt,
      input: command.prompt,
      output,
      ...(route.reasoningEffort === undefined ? {} : { effort: route.reasoningEffort }),
      maxOutputTokens: Math.max(route.minOutputTokens,
        Number.isSafeInteger(requested) && (requested as number) > 0 ? requested as number : 0),
      limits: { outputBytes: gatewayLlmOutputBytes(command.purpose) },
      deadline: gatewayLlmDeadline(startedAt, command.timeoutMs),
      ...(decode === undefined ? {} : { decode }),
    },
  };
};

const objectOutput = (value: unknown): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Gateway structured output is not an object");
  }
  return value as Record<string, unknown>;
};
