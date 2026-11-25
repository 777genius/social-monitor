import { collectGatewaySchemaLimits } from "./gateway-llm-schema-limit-collector";
import { promptLengthShare as publicShare } from "./gateway-llm-schema-limits";
import {
  projectGatewaySchemaPromptNodeConstraints,
  promptLengthShare,
} from "./gateway-llm-schema-prompt-constraint-policy";

describe("gateway prompt constraint owner", () => {
  it("keeps ordered numeric and array limits independent of schema traversal", () => {
    const sink = { lines: new Set<string>(), empty: new Set<string>() };
    const node = Object.freeze({
      type: Object.freeze(["number", "array"]),
      minimum: 0, maximum: 1, minItems: 2, maxItems: 3,
    });
    expect(projectGatewaySchemaPromptNodeConstraints(sink, node, "$.metric")).toBe(true);
    expect([...sink.lines]).toEqual([
      "- $.metric: a number from 0 to 1",
      "- $.metric: 2 to 3 items",
    ]);
    expect(sink.empty.size).toBe(0);
    expect(node.type).toEqual(["number", "array"]);
    expect(publicShare).toBe(promptLengthShare);
    expect(promptLengthShare).toBe(0.85);
  });

  it("terminates empty arrays without suppressing sibling constraints", () => {
    const sink = { lines: new Set<string>(), empty: new Set<string>() };
    expect(projectGatewaySchemaPromptNodeConstraints(sink,
      Object.freeze({ type: "array", maxItems: 0, items: { type: "string", maxLength: 40 } }),
      "$.empty")).toBeUndefined();
    expect([...sink.empty]).toEqual(["$.empty"]);
    expect(projectGatewaySchemaPromptNodeConstraints(sink,
      Object.freeze({ type: "string", maxLength: 10 }), "$.label")).toBe(false);
    expect([...sink.lines]).toEqual(["- $.label: at most 8 characters"]);
    expect(collectGatewaySchemaLimits({
      type: "object", properties: {
        empty: { type: "array", maxItems: 0, items: { type: "string", maxLength: 40 } },
        label: { type: "string", maxLength: 10 },
      },
    })).toEqual({ lines: ["- $.label: at most 8 characters"], empty: ["$.empty"] });
  });

  it("preserves copied-value exclusions and rejects invalid numeric limits", () => {
    const sink = { lines: new Set<string>(), empty: new Set<string>() };
    expect(projectGatewaySchemaPromptNodeConstraints(sink,
      { type: "string", maxLength: 300 }, "$.sourceUrl")).toBe(false);
    expect(projectGatewaySchemaPromptNodeConstraints(sink,
      { type: "number", minimum: Number.NEGATIVE_INFINITY }, "$.score")).toBe(false);
    expect([...sink.lines]).toEqual([]);
    expect([...sink.empty]).toEqual([]);
  });
});
