import { prepareGatewayLlmOutput } from "./gateway-llm-structured-output";

const schema = { type: "object", properties: { label: { type: "string" },
  note: { type: "string" } }, required: ["label"], additionalProperties: false };

const admitted = (outputSchema: Record<string, unknown>) => {
  const prepared = prepareGatewayLlmOutput(outputSchema);
  if ("failure" in prepared) throw new Error("Expected a valid gateway output schema");
  return prepared;
};

describe("gateway LLM structured-output trust boundary", () => {
  it("leaves text tasks free of decoders and diagnostics", () => {
    const prepared = admitted({});
    expect(prepared).toMatchObject({ structured: false, output: { mode: "text" } });
    expect(prepared.decode).toBeUndefined();
    expect(prepared.outputViolations()).toBeUndefined();
  });

  it("preserves strict nullable optional field conversion without mutating caller schema", () => {
    const prepared = admitted(schema);
    expect(prepared.output).toMatchObject({ mode: "json_schema", strict: true,
      schema: { required: ["label", "note"], additionalProperties: false } });
    expect(prepared.decode!({ label: "Agents", note: null })).toEqual({ label: "Agents" });
    expect(prepared.outputViolations()).toBeUndefined();
    expect(schema.required).toEqual(["label"]);
  });

  it("rejects malformed provider output and clears diagnostics after valid decode", () => {
    const prepared = admitted(schema);
    const decode = prepared.decode!;
    expect(() => decode({ label: 123, note: null })).toThrow();
    expect(prepared.outputViolations()).toMatchObject({ first: expect.any(String),
      all: expect.any(Array) });
    expect(prepared.outputViolations()!.all.length).toBeGreaterThan(0);
    expect(() => decode({ label: "Agents", note: null, unexpected: "untrusted" })).toThrow();
    expect(decode({ label: "Agents", note: null })).toEqual({ label: "Agents" });
    expect(prepared.outputViolations()).toBeUndefined();
  });
});
