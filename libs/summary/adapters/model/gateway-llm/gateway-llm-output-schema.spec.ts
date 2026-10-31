import { prepareStrictJsonSchema } from "@agent-teams/account-gateway/llm";

import { readerPostPresentationV3OutputSchema } from "../../../domain/services/reader-post-presentation-v3-proposal";
import {
  agentRuntimeReaderSummaryRelatedTopicVerifierJsonSchema,
  agentRuntimeReaderSummaryStoryRelationVerifierJsonSchema,
} from "../agent-runtime-reader-summary-story-relation-verifier-prompt";
import { agentRuntimeReaderSummaryTopicLabelerJsonSchema } from "../agent-runtime-reader-summary-topic-labeler-prompt";
import { agentRuntimeReaderSummaryTopicRelationVerifierJsonSchema } from "../agent-runtime-reader-summary-topic-relation-verifier-prompt";
import { openAiReaderSummaryJsonSchema } from "../openai-responses-reader-summary-schema";
import { withExplicitValueTypes } from "./gateway-llm-output-schema";

type Node = Record<string, unknown>;

/** Paths of nodes Kimi would reject: no type and no reference or composition. */
const untypedPaths = (node: Node, path = "$"): string[] => {
  const own = node.type === undefined && node.$ref === undefined && node.anyOf === undefined &&
    node.oneOf === undefined && node.allOf === undefined ? [path] : [];
  const children = Object.entries(node).flatMap(([key, value]): [string, Node][] => {
    if (["properties", "$defs"].includes(key) && value !== null && typeof value === "object") {
      return Object.entries(value as Record<string, Node>).map(([name, child]) => [`${path}.${key}.${name}`, child]);
    }
    if (["anyOf", "oneOf", "allOf"].includes(key) && Array.isArray(value)) {
      return value.map((child, index) => [`${path}.${key}[${index}]`, child as Node]);
    }
    return key === "items" && value !== null && typeof value === "object" ? [[`${path}.items`, value as Node]] : [];
  });
  return [...own, ...children.flatMap(([childPath, child]) => untypedPaths(child, childPath))];
};

describe("withExplicitValueTypes", () => {
  it.each([
    ["reader summary", openAiReaderSummaryJsonSchema],
    ["topic labels", agentRuntimeReaderSummaryTopicLabelerJsonSchema],
    ["story relations", agentRuntimeReaderSummaryStoryRelationVerifierJsonSchema],
    ["related topic relations", agentRuntimeReaderSummaryRelatedTopicVerifierJsonSchema],
    ["topic relations", agentRuntimeReaderSummaryTopicRelationVerifierJsonSchema],
    ["presentation", readerPostPresentationV3OutputSchema],
  ] as const)("leaves no untyped node in the %s schema sent to the gateway", (_name, schema) => {
    const sent = prepareStrictJsonSchema(withExplicitValueTypes(schema as unknown as Node)).schema as Node;
    expect(untypedPaths(sent)).toEqual([]);
  });

  it("derives the type only from enum or const values and keeps declared types", () => {
    expect(withExplicitValueTypes({ type: "object", properties: {
      level: { enum: ["low", "high"] }, score: { enum: [1, 2.5] }, flag: { const: true },
      maybe: { enum: ["x", null] }, declared: { type: "string", enum: ["a"] }, free: {} } }))
      .toEqual({ type: "object", properties: {
        level: { type: "string", enum: ["low", "high"] }, score: { type: "number", enum: [1, 2.5] },
        flag: { type: "boolean", const: true }, maybe: { type: ["string", "null"], enum: ["x", null] },
        declared: { type: "string", enum: ["a"] }, free: {} } });
  });
});
