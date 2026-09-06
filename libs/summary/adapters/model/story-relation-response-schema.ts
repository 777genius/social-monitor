import { fromJSONSchema, type ZodType } from "zod";
import { AgentRuntimeModelProviderError } from "./agent-runtime-model-support";

// Outer wire contract only. Domain rationale remains an optional annotation.
// Use the installed production dependency, not the dev-only root Ajv package.
const validators = new WeakMap<object, ZodType>();
const maxErrors = 20;
const bounded = (value: string): string => value.slice(0, 160);

export const assertStoryRelationResponseSchema = (
  raw: unknown,
  schema: Record<string, unknown>,
): void => {
  let validate = validators.get(schema);
  if (!validate) {
    validate = fromJSONSchema(schema);
    validators.set(schema, validate);
  }
  const result = validate.safeParse(raw);
  if (result.success) return;
  const errors = result.error.issues;
  // Never use the parsed copy: acceptance/attestation retains the original output.
  // Never include data values or raw output in failures/logs.
  const details = errors.slice(0, maxErrors).map((error) => ({
    path: bounded(error.path.map((part) => typeof part === "number"
      ? `[${part}]` : `.${String(part)}`).join("") || "/"),
    keyword: error.code,
    ...(error.code === "unrecognized_keys"
      ? { properties: error.keys.slice(0, maxErrors).map(bounded),
          omittedProperties: Math.max(0, error.keys.length - maxErrors) }
      : {}),
  }));
  throw new AgentRuntimeModelProviderError({
    kind: "invalid_schema",
    retryable: false,
    message: `Invalid production output schema: ${JSON.stringify(details)}; ${errors.length} errors (${Math.max(0, errors.length - maxErrors)} omitted)`,
  });
};
