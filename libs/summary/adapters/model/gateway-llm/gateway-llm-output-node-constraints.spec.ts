import { collectOutputViolations, safeOutputViolationPattern } from "./gateway-llm-output-violations";
import {
  explainOutputNodeConstraints,
  outputSchemaAllowsValueType,
  resolveOutputSchemaReference,
} from "./gateway-llm-output-node-constraints";

describe("gateway output schema node constraints", () => {
  it("preserves integer-as-number and the exact stop-before-children precedence", () => {
    expect(outputSchemaAllowsValueType({ type: "number" }, 3)).toBe(true);
    expect(outputSchemaAllowsValueType({ type: "integer" }, 1.5)).toBe(false);
    expect(explainOutputNodeConstraints({ type: "string", enum: ["ok"], maxLength: 1 },
      4, "$.code")).toEqual({ violations: ["$.code:type"], canVisitChildren: false });
    expect(explainOutputNodeConstraints({ type: "string", enum: ["ok"], maxLength: 1 },
      "secret value", "$.code")).toEqual({ violations: ["$.code:enum"], canVisitChildren: false });
    expect(explainOutputNodeConstraints({ type: "string", const: "ok" },
      "secret value", "$.code")).toEqual({ violations: ["$.code:const"], canVisitChildren: false });
  });

  it("reports length, numeric and array limits in their original order without values", () => {
    const cases: ReadonlyArray<readonly [Record<string, unknown>, unknown, readonly string[]]> = [
      [{ type: "string", maxLength: 2, minLength: 5 }, "abc", ["$.field:maxLength=2", "$.field:minLength=5"]],
      [{ type: "number", maximum: 1, minimum: 5 }, 3, ["$.field:maximum=1", "$.field:minimum=5"]],
      [{ type: "array", maxItems: 1, minItems: 4 }, [1, 2], ["$.field:maxItems=1", "$.field:minItems=4"]],
    ];
    for (const [node, value, expected] of cases) {
      expect(explainOutputNodeConstraints(node, value, "$.field"))
        .toEqual({ violations: expected, canVisitChildren: true });
      expect(expected.every((message) => safeOutputViolationPattern.test(message))).toBe(true);
    }
  });

  it("resolves only explicit local definitions and retains canonical enum matching", () => {
    const schema = { $defs: { "a/b": { type: "number", maximum: 1 } } };
    expect(resolveOutputSchemaReference(schema, "#/$defs/a~1b")).toEqual({ type: "number", maximum: 1 });
    expect(resolveOutputSchemaReference(schema, "https://example.test/schema")).toBeUndefined();
    expect(resolveOutputSchemaReference(schema, "#/$defs/absent")).toBeUndefined();
    expect(explainOutputNodeConstraints({ enum: [{ z: 1, a: 2 }] },
      { a: 2, z: 1 }, "$.enum").violations).toEqual([]);
    expect(collectOutputViolations(
      { type: "object", properties: { number: { $ref: "#/$defs/a~1b" } }, $defs: schema.$defs },
      { number: 3 },
    )).toEqual(["$.number:maximum=1"]);
  });

  it("never embeds adversarial output strings in keyword-only repair diagnostics", () => {
    const privateText = "DO NOT include provider content in repair messages";
    const found = collectOutputViolations(
      { type: "object", additionalProperties: false, required: ["name"],
        properties: { name: { type: "string", maxLength: 1 } } },
      { name: privateText, "untrusted model-invented field": 7 },
    );
    expect(found).toEqual(["$.name:maxLength=1", "$:additionalProperties"]);
    expect(found.every((entry) => safeOutputViolationPattern.test(entry))).toBe(true);
    expect(JSON.stringify(found)).not.toContain(privateText);
    expect(JSON.stringify(found)).not.toContain("untrusted model-invented");
  });
});
