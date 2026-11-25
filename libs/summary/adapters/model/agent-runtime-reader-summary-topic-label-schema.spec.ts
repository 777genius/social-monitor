import { assertMimoTopicLabelOwnKeys } from "./agent-runtime-reader-summary-topic-label-schema";

describe("MiMo topic-label trusted response schema boundary", () => {
  it("rejects unrecognized root keys and untrusted nested properties", () => {
    expect(() => assertMimoTopicLabelOwnKeys({ nodeLabels: [], groups: [], extra: true }))
      .toThrow("MiMo topic label output conflicts with purpose schema");
    expect(() => assertMimoTopicLabelOwnKeys({
      nodeLabels: [{ nodeId: "synthetic", notFromSchema: true }],
      groups: [],
    })).toThrow("MiMo topic label output conflicts with purpose schema");
  });

  it("does not add an identity or labels to empty native arrays", () => {
    expect(() => assertMimoTopicLabelOwnKeys({ nodeLabels: [], groups: [] }))
      .not.toThrow();
  });
});
