import type { SummaryModelInput, SummaryModelRoute } from "../../ports";
import { buildOpenAiSummaryLineage as legacyLineage } from "./openai-responses-summary-draft-normalizer";
import { buildOpenAiSummaryLineage } from "./openai-responses-summary-lineage";

describe("OpenAI summary lineage ownership", () => {
  it("retains the original exported function object and immutable route/policy values", () => {
    const input = Object.freeze({
      policy: Object.freeze({ rulesVersion: "rules.synthetic.v1" }),
    }) as SummaryModelInput;
    const route: SummaryModelRoute = Object.freeze({
      provider: "openai-responses",
      model: "synthetic-model",
      promptVersion: "summary.prompt.synthetic.v1",
      schemaVersion: "summary.artifact.v1",
    });
    expect(legacyLineage).toBe(buildOpenAiSummaryLineage);
    expect(buildOpenAiSummaryLineage(input, route, "eval.synthetic.v1")).toEqual({
      promptVersion: "summary.prompt.synthetic.v1",
      schemaVersion: "summary.artifact.v1",
      modelVersion: "synthetic-model",
      providerVersion: "openai-responses",
      rulesVersion: "rules.synthetic.v1",
      evalDatasetVersion: "eval.synthetic.v1",
    });
    expect(route.model).toBe("synthetic-model");
    expect(input.policy.rulesVersion).toBe("rules.synthetic.v1");
  });
});
