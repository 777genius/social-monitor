import { InvalidStoryRelationDecisionBatchError } from "../../ports";
import { AgentRuntimeModelProviderError } from "./agent-runtime-model-support";
import { assertStoryRelationResponseSchema } from "./story-relation-response-schema";

export const readDecisionEnvelope = (
  raw: Record<string, unknown>,
): readonly unknown[] => {
  const properties = Object.keys(raw);
  if (properties.some((property) => property !== "decisions")) {
    throw invalidDecisionEnvelope("envelope_unknown_property");
  }
  if (!Array.isArray(raw.decisions)) {
    throw invalidDecisionEnvelope("envelope_missing_decisions");
  }
  return raw.decisions;
};

export const normalizeBinaryDecisions = (
  raw: Record<string, unknown>,
): readonly unknown[] =>
  Array.isArray(raw.decisions)
    ? raw.decisions.map(normalizeBinaryDecision)
    : [];

const normalizeBinaryDecision = (
  value: unknown,
): unknown => {
  if (!isRecord(value)) return value;
  const { rationale, ...properties } = value;
  const leftFeedItemId = stringValue(value.leftFeedItemId);
  const rightFeedItemId = stringValue(value.rightFeedItemId);
  return {
    ...properties,
    ...(leftFeedItemId === undefined ? {} : { leftFeedItemId }),
    ...(rightFeedItemId === undefined ? {} : { rightFeedItemId }),
    ...(rationale === undefined
      ? {}
      : typeof rationale === "string"
        ? { rationale: rationale.trim() }
        : { rationale }),
  };
};

const stringValue = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;

const invalidDecisionEnvelope = (
  reason: ConstructorParameters<typeof InvalidStoryRelationDecisionBatchError>[0],
): Error => new InvalidStoryRelationDecisionBatchError(reason);

export const parseJsonObject = (value: string, schema: Record<string, unknown>): Record<string, unknown> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new AgentRuntimeModelProviderError({
      kind: "invalid_schema", retryable: false,
      message: "Reader summary story relation response is not valid JSON",
    });
  }
  assertStoryRelationResponseSchema(parsed, schema);
  return parsed as Record<string, unknown>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
