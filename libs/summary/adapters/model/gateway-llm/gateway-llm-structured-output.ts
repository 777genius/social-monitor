import { LlmSchemaError, prepareStrictJsonSchema } from "@agent-teams/account-gateway/llm";
import type { LlmTask } from "@agent-teams/account-gateway/llm";

import type { AgentRuntimeFailure, AgentRuntimeTaskCommand } from "../../../ports";
import { gatewayLlmLocalFailure, type GatewayLlmOutputViolations } from "./gateway-llm-failure";
import { toGatewayOutputSchema } from "./gateway-llm-output-schema";
import { collectOutputViolations } from "./gateway-llm-output-violations";

type PreparedTask = Pick<LlmTask<Record<string, unknown>>, "output" | "decode">;

/** Provider-specific strict JSON trust boundary, independent of route and account admission. */
export type GatewayLlmPreparedOutput = {
  readonly structured: boolean;
  readonly output: PreparedTask["output"];
  readonly decode?: PreparedTask["decode"];
  readonly outputViolations: () => GatewayLlmOutputViolations | undefined;
};

export const prepareGatewayLlmOutput = (
  outputSchema: AgentRuntimeTaskCommand["outputSchema"],
): GatewayLlmPreparedOutput | { readonly failure: AgentRuntimeFailure } => {
  const structured = Object.keys(outputSchema).length > 0;
  let output: PreparedTask["output"] = { mode: "text" };
  let decode: PreparedTask["decode"];
  let violations: GatewayLlmOutputViolations | undefined;
  if (structured) {
    // Strict providers need every property required and objects closed;
    // decode strips the added nulls and validates the original schema, so
    // a provider that ignores the schema still cannot pass invalid output.
    try {
      const gatewaySchema = toGatewayOutputSchema(outputSchema);
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
  return { structured, output, decode, outputViolations: () => violations };
};

const objectOutput = (value: unknown): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Gateway structured output is not an object");
  }
  return value as Record<string, unknown>;
};
