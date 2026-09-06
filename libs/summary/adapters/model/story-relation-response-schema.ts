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
  const errors = result.success ? rawOwnKeyIssues(raw, schema) : result.error.issues;
  if (errors.length === 0) return;
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

// Zod 4 skips own __proto__ keys. Inspect the two known wire object
// boundaries against their schema properties; Zod owns every other constraint.
const rawOwnKeyIssues = (raw: unknown, schema: Record<string, unknown>) => {
  const issues: { code: "unrecognized_keys"; path: (string | number)[]; keys: string[] }[] = [];
  const inspect = (value: unknown, objectSchema: Record<string, unknown>, path: (string | number)[]) => {
    if (!isRecord(value) || objectSchema.additionalProperties !== false) return;
    const properties = objectSchema.properties;
    if (!isRecord(properties)) return;
    const keys = Object.keys(value).filter((key) => !Object.hasOwn(properties, key));
    if (keys.length) issues.push({ code: "unrecognized_keys", path, keys });
  };
  inspect(raw, schema, []);
  const properties = schema.properties;
  if (isRecord(raw) && Array.isArray(raw.decisions) && isRecord(properties) &&
      Object.hasOwn(properties, "decisions")) {
    const decisionsSchema = properties.decisions;
    if (isRecord(decisionsSchema) && isRecord(decisionsSchema.items)) {
      const itemSchema = decisionsSchema.items;
      raw.decisions.forEach((decision, index) => inspect(decision, itemSchema, ["decisions", index]));
    }
  }
  return issues;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
