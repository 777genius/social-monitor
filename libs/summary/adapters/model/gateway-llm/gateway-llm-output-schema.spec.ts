import { prepareStrictJsonSchema } from "@agent-teams/account-gateway/llm";

import { readerPostPresentationV3OutputSchema } from "../../../domain/services/reader-post-presentation-v3-proposal";
import {
  agentRuntimeReaderSummaryRelatedTopicVerifierJsonSchema,
  agentRuntimeReaderSummaryStoryRelationVerifierJsonSchema,
} from "../agent-runtime-reader-summary-story-relation-verifier-prompt";
import { agentRuntimeReaderSummaryTopicLabelerJsonSchema } from "../agent-runtime-reader-summary-topic-labeler-prompt";
import { agentRuntimeReaderSummaryTopicRelationVerifierJsonSchema } from "../agent-runtime-reader-summary-topic-relation-verifier-prompt";
import { openAiReaderSummaryJsonSchema } from "../openai-responses-reader-summary-schema";
import { toGatewayOutputSchema } from "./gateway-llm-output-schema";

type Node = Record<string, unknown>;

/**
 * Paths Kimi would not enforce: a node without a type, reference or
 * composition is refused with HTTP 400, and a type list switches off
 * enforcement of the whole schema.
 */
const unenforceablePaths = (node: Node, path = "$"): string[] => {
  const own = Array.isArray(node.type) || (node.type === undefined && node.$ref === undefined &&
    node.anyOf === undefined && node.oneOf === undefined && node.allOf === undefined) ? [path] : [];
  const children = Object.entries(node).flatMap(([key, value]): [string, Node][] => {
    if (["properties", "$defs"].includes(key) && value !== null && typeof value === "object") {
      return Object.entries(value as Record<string, Node>).map(([name, child]) => [`${path}.${key}.${name}`, child]);
    }
    if (["anyOf", "oneOf", "allOf"].includes(key) && Array.isArray(value)) {
      return value.map((child, index) => [`${path}.${key}[${index}]`, child as Node]);
    }
    return key === "items" && value !== null && typeof value === "object" ? [[`${path}.items`, value as Node]] : [];
  });
  return [...own, ...children.flatMap(([childPath, child]) => unenforceablePaths(child, childPath))];
};

describe("toGatewayOutputSchema", () => {
  it.each([
    ["reader summary", openAiReaderSummaryJsonSchema],
    ["topic labels", agentRuntimeReaderSummaryTopicLabelerJsonSchema],
    ["story relations", agentRuntimeReaderSummaryStoryRelationVerifierJsonSchema],
    ["related topic relations", agentRuntimeReaderSummaryRelatedTopicVerifierJsonSchema],
    ["topic relations", agentRuntimeReaderSummaryTopicRelationVerifierJsonSchema],
    ["presentation", readerPostPresentationV3OutputSchema],
  ] as const)("sends the %s schema in a form Kimi enforces everywhere", (_name, schema) => {
    const sent = prepareStrictJsonSchema(toGatewayOutputSchema(schema as unknown as Node)).schema as Node;
    expect(unenforceablePaths(sent)).toEqual([]);
  });

  it("derives the type only from enum or const values and keeps declared types", () => {
    expect(toGatewayOutputSchema({ type: "object", properties: {
      level: { enum: ["low", "high"] }, score: { enum: [1, 2.5] }, flag: { const: true },
      maybe: { enum: ["x", null] }, declared: { type: "string", enum: ["a"] }, free: {} } }))
      .toEqual({ type: "object", properties: {
        level: { type: "string", enum: ["low", "high"] }, score: { type: "number", enum: [1, 2.5] },
        flag: { type: "boolean", const: true },
        maybe: { anyOf: [{ type: "string", enum: ["x"] }, { type: "null" }] },
        declared: { type: "string", enum: ["a"] }, free: {} } });
  });

  it("splits a type list into per-type branches that accept exactly the same values", () => {
    const schema = { type: "object", additionalProperties: false, required: ["text", "ids", "reason"],
      properties: { text: { type: ["string", "null"], maxLength: 3, description: "kept on the wrapper" },
        ids: { type: ["array", "null"], items: { type: "string", maxLength: 2 }, maxItems: 1 },
        reason: { enum: ["x", null] } } };
    const sent = toGatewayOutputSchema(schema);
    expect((sent.properties as Record<string, Node>).text).toEqual({ description: "kept on the wrapper",
      anyOf: [{ type: "string", maxLength: 3 }, { type: "null" }] });
    expect((sent.properties as Record<string, Node>).ids).toEqual({ anyOf: [
      { type: "array", items: { type: "string", maxLength: 2 }, maxItems: 1 }, { type: "null" }] });
    const original = prepareStrictJsonSchema(schema);
    const rewritten = prepareStrictJsonSchema(sent);
    const accepts = (decode: (value: unknown) => unknown, value: unknown): boolean => {
      try { decode(value); return true; } catch { return false; }
    };
    for (const value of [
      { text: "abc", ids: ["ab"], reason: "x" }, { text: null, ids: null, reason: null },
      { text: "abcd", ids: [], reason: "x" }, { text: "a", ids: ["a", "b"], reason: "x" },
      { text: "a", ids: ["abc"], reason: "x" }, { text: "a", ids: [], reason: "y" }, { text: 1, ids: [], reason: "x" },
    ]) {
      expect([value, accepts(rewritten.decode, value)]).toEqual([value, accepts(original.decode, value)]);
    }
    expect(accepts(rewritten.decode, { text: "abcd", ids: [], reason: "x" })).toBe(false);
  });
});
