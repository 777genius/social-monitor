import { agentRuntimeReaderSummaryTopicLabelerJsonSchema } from "./agent-runtime-reader-summary-topic-labeler-response-schema";
import { fromJSONSchema } from "zod";

let mimoTopicLabelSchema: ReturnType<typeof fromJSONSchema> | undefined;

export const assertMimoTopicLabelSchema = (raw: Record<string, unknown>): void => {
  mimoTopicLabelSchema ??= fromJSONSchema(
    agentRuntimeReaderSummaryTopicLabelerJsonSchema as Record<string, unknown>,
  );
  if (!mimoTopicLabelSchema.safeParse(raw).success) {
    throw new Error("MiMo topic label output conflicts with purpose schema");
  }
  assertMimoTopicLabelOwnKeys(raw);
};

export const assertMimoTopicLabelOwnKeys = (raw: Record<string, unknown>): void => {
  const schema = agentRuntimeReaderSummaryTopicLabelerJsonSchema;
  const hasOnlyKeys = (value: Record<string, unknown>, allowed: readonly string[]) =>
    Object.keys(value).every((key) => allowed.includes(key));
  if (!hasOnlyKeys(raw, Object.keys(schema.properties))) {
    throw new Error("MiMo topic label output conflicts with purpose schema");
  }
  for (const [values, itemSchema] of [
    [raw.nodeLabels, schema.properties.nodeLabels.items],
    [raw.groups, schema.properties.groups.items],
  ] as const) {
    if (!Array.isArray(values) || values.some((value) =>
      value === null || typeof value !== "object" || Array.isArray(value) ||
      !hasOnlyKeys(value as Record<string, unknown>, Object.keys(itemSchema.properties)))) {
      throw new Error("MiMo topic label output conflicts with purpose schema");
    }
  }
};

