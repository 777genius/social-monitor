import { mapGatewaySchemaTree } from "./gateway-llm-schema-traversal";

describe("mapGatewaySchemaTree", () => {
  it("visits known schema children bottom-up while keeping unknown payloads opaque", () => {
    const opaque = Object.freeze({ label: "opaque" });
    const source = Object.freeze({
      label: "root",
      properties: Object.freeze({ nested: Object.freeze({ label: "property" }) }),
      $defs: Object.freeze({ definition: Object.freeze({ label: "definition" }) }),
      anyOf: Object.freeze([Object.freeze({ label: "union" })]),
      prefixItems: Object.freeze([Object.freeze({ label: "tuple" })]),
      additionalProperties: Object.freeze({ label: "additional" }),
      not: Object.freeze({ label: "not" }),
      extra: opaque,
    });
    const order: string[] = [];
    const result = mapGatewaySchemaTree(source, (node) => {
      order.push(node.label as string);
      return { ...node, visited: true };
    });
    expect(order).toEqual(["property", "definition", "union", "tuple", "additional", "not", "root"]);
    expect(result.properties).toMatchObject({ nested: { visited: true } });
    expect(result.$defs).toMatchObject({ definition: { visited: true } });
    expect(result.anyOf).toMatchObject([{ visited: true }]);
    expect(result.prefixItems).toMatchObject([{ visited: true }]);
    expect((result.additionalProperties as Record<string, unknown>).visited).toBe(true);
    expect((result.not as Record<string, unknown>).visited).toBe(true);
    expect(result.extra).toBe(opaque);
    expect(opaque).not.toHaveProperty("visited");
    expect(source).not.toHaveProperty("visited");
    expect(source.properties.nested).not.toHaveProperty("visited");
  });

  it("leaves primitive and null keyword values unchanged and never rewrites unknown containers", () => {
    const source = {
      type: "object",
      properties: { primitive: 7, nil: null },
      items: false,
      oneOf: ["literal", null, { type: "string" }],
      custom: { type: "string" },
    };
    const result = mapGatewaySchemaTree(source, (node) => ({ ...node, policy: true }));
    expect(result).toEqual({
      ...source,
      policy: true,
      properties: source.properties,
      oneOf: ["literal", null, { type: "string", policy: true }],
    });
    expect(source.oneOf[2]).toEqual({ type: "string" });
    expect(source.custom).toEqual({ type: "string" });
  });
});
