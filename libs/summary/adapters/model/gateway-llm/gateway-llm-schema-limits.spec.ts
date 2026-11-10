import { collectGatewaySchemaLimits } from "./gateway-llm-schema-limit-collector";
import { gatewayOutputHardLimits, promptLengthShare } from "./gateway-llm-schema-limits";

describe("gateway schema limits / prompt boundary", () => {
  it("preserves ordered limits, copied URL exclusion, range and empty arrays through refs", () => {
    const schema = {
      type: "object",
      $defs: {
        article: {
          type: "object",
          properties: {
            headline: { type: "string", maxLength: 100 },
            canonicalUrl: { type: "string", maxLength: 200 },
            quality: { type: "number", minimum: 0, maximum: 1 },
            tags: { type: "array", minItems: 2, maxItems: 4,
              items: { type: "string", maxLength: 20 } },
            unused: { type: "array", maxItems: 0 },
          },
        },
      },
      properties: { content: { $ref: "#/$defs/article" } },
    };
    const collected = collectGatewaySchemaLimits(schema);
    expect(collected).toEqual({
      lines: [
        "- $.content.headline: at most 85 characters",
        "- $.content.quality: a number from 0 to 1",
        "- $.content.tags: 2 to 4 items",
        "- $.content.tags[]: at most 17 characters",
      ],
      empty: ["$.content.unused"],
    });
    expect(promptLengthShare).toBe(0.85);
    expect(gatewayOutputHardLimits(schema)).toBe([
      "Hard limits. They override any longer length guidance above, and the response is rejected when any of them is exceeded. Stay inside them by writing complete, shorter sentences; never cut a sentence or word to fit.",
      ...collected.lines,
      "- always empty arrays: $.content.unused",
    ].join("\n"));
  });

  it("rejects ref recursion without losing a bounded sibling field", () => {
    const schema = {
      $defs: { recursive: {
        type: "object",
        properties: {
          next: { $ref: "#/$defs/recursive" },
          label: { type: "string", maxLength: 10 },
        },
      } },
      type: "object",
      properties: { data: { $ref: "#/$defs/recursive" } },
    };
    expect(collectGatewaySchemaLimits(schema)).toEqual({
      lines: ["- $.data.label: at most 8 characters"],
      empty: [],
    });
  });

  it("preserves numeric and array boundary formatting for anyOf/oneOf branches", () => {
    const schema = {
      type: "object", properties: {
        score: { oneOf: [
          { type: "number", minimum: 0 },
          { type: "integer", maximum: 10 },
        ] },
        names: { anyOf: [
          { type: "array", minItems: 1 },
          { type: "array", maxItems: 3 },
        ] },
      },
    };
    expect(collectGatewaySchemaLimits(schema).lines).toEqual([
      "- $.score: a number of at least 0",
      "- $.score: a number of at most 10",
      "- $.names: at least 1 items",
      "- $.names: at most 3 items",
    ]);
  });

  it("does not treat invalid constraints as safe hard limits", () => {
    const schema = { type: "object", properties: {
      copiedId: { type: "string", maxLength: 12 },
      broken: { type: "string", maxLength: -1 },
      infinite: { type: "number", minimum: Number.NEGATIVE_INFINITY },
      count: { type: "array", maxItems: 0.5 },
    } };
    expect(collectGatewaySchemaLimits(schema)).toEqual({ lines: [], empty: [] });
  });
});
