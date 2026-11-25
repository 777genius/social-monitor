import type { ZodIssue } from "zod";
import { AgentRuntimeModelProviderError } from "./agent-runtime-model-support";
import type { rawOwnKeyIssues } from "./story-relation-response-own-keys";

type StoryRelationSchemaIssue = ZodIssue | ReturnType<typeof rawOwnKeyIssues>[number];

const maxErrors = 20;
const bounded = (value: string): string => value.slice(0, 160);

/** Redacted, bounded diagnostics: never copy provider data or the parsed Zod result. */
export const rejectStoryRelationSchemaIssues = (
  errors: readonly StoryRelationSchemaIssue[],
): never => {
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
