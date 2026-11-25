import { collectOutputViolations } from "./gateway-llm-output-violations";
import { toGatewayOutputSchema } from "./gateway-llm-output-schema";
import { isSchemaNode, schemaJsonType } from "./gateway-llm-schema-primitives";

describe("Gateway output schema shared JSON primitives", () => {
  it("keeps the exact integer/number/null distinction and excludes array nodes", () => {
    expect([null, [], {}, 0, -1, 0.5, NaN, "x", true, undefined].map(schemaJsonType))
      .toEqual(["null", "array", "object", "integer", "integer", "number", "number", "string", "boolean", "undefined"]);
    expect(isSchemaNode({ type: "object" })).toBe(true);
    expect(isSchemaNode(null)).toBe(false);
    expect(isSchemaNode(["not a node"])).toBe(false);
  });

  it("keeps gateway nullable enum rewriting and redacted failure paths in agreement", () => {
    const output = toGatewayOutputSchema({
      type: "object",
      additionalProperties: false,
      required: ["label", "optional"],
      properties: {
        label: { enum: ["ok", null] },
        optional: { type: ["string", "null"], maxLength: 3 },
      },
    });
    expect(output).toEqual({
      type: "object",
      additionalProperties: false,
      required: ["label", "optional"],
      properties: {
        label: { anyOf: [{ type: "string", enum: ["ok"] }, { type: "null" }] },
        optional: { anyOf: [{ type: "string", maxLength: 3 }, { type: "null" }] },
      },
    });
    expect(collectOutputViolations(output, { label: null, optional: null })).toEqual([]);
    expect(collectOutputViolations(output, { label: "wrong", optional: "overlong" }))
      .toEqual(["$.label:enum", "$.optional:maxLength=3"]);
  });
});
