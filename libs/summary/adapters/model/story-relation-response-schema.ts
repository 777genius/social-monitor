import { fromJSONSchema, type ZodType } from "zod";
import { rejectStoryRelationSchemaIssues } from "./story-relation-response-schema-failure";
import { rawOwnKeyIssues } from "./story-relation-response-own-keys";

// Outer wire contract only. Domain rationale remains an optional annotation.
// Use the installed production dependency, not the dev-only root Ajv package.
const validators = new WeakMap<object, ZodType>();

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
  // Acceptance/attestation still retains the original raw output.
  rejectStoryRelationSchemaIssues(errors);
};
