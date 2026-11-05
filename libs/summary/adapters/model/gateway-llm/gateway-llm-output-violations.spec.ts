import { prepareStrictJsonSchema } from "@agent-teams/account-gateway/llm";

import { openAiReaderSummaryJsonSchema } from "../openai-responses-reader-summary-schema";
import { toGatewayOutputSchema } from "./gateway-llm-output-schema";
import { collectOutputViolations, safeOutputViolationPattern } from "./gateway-llm-output-violations";

type Node = Record<string, unknown>;
const schema = toGatewayOutputSchema({ type: "object", additionalProperties: false,
  required: ["title", "tags", "level", "note", "items"],
  properties: {
    title: { type: "string", maxLength: 5 },
    tags: { type: "array", items: { type: "string" }, maxItems: 1 },
    level: { enum: ["low", "high"] },
    note: { type: ["string", "null"], maxLength: 3 },
    items: { type: "array", items: { $ref: "#/$defs/item" } },
  },
  $defs: { item: { type: "object", additionalProperties: false, required: ["id", "score"],
    properties: { id: { type: "string" }, score: { type: "number", minimum: 0, maximum: 1 } } } } });

describe("collectOutputViolations", () => {
  it("names every broken path and limit, never invented keys or values", () => {
    const value = { title: "too long title", tags: ["a", "b"], level: "medium", note: "long note",
      items: [{ id: "x", score: 75 }, { score: 0.5, "secret prompt text": "leak" }], "invented key": 1 };

    const found = collectOutputViolations(schema, value);

    expect([...found].sort()).toEqual([
      "$:additionalProperties", "$.title:maxLength=5", "$.tags:maxItems=1", "$.level:enum",
      "$.note:maxLength=3", "$.items[0].score:maximum=1", "$.items[1].id:required",
      "$.items[1]:additionalProperties",
    ].sort());
    expect(found.every((entry) => safeOutputViolationPattern.test(entry))).toBe(true);
    expect(JSON.stringify(found)).not.toMatch(/invented|secret|leak|medium|long/u);
    expect(() => prepareStrictJsonSchema(schema).decode(value)).toThrow();
  });

  it("stays silent on output the strict decode accepts and is bounded", () => {
    const valid = { title: "ok", tags: [], level: "low", note: null, items: [{ id: "x", score: 1 }] };
    expect(prepareStrictJsonSchema(schema).decode(valid)).toBeDefined();
    expect(collectOutputViolations(schema, valid)).toEqual([]);
    const many = { headline: "x".repeat(400), executiveSummary: "y".repeat(5_000) };
    expect(collectOutputViolations(toGatewayOutputSchema(openAiReaderSummaryJsonSchema as unknown as Node), many, 3))
      .toHaveLength(3);
  });
});
