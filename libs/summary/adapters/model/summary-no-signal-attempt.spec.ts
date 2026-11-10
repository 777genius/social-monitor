import type { SummaryModelInput, SummaryModelRoute } from "../../ports";
import { buildSummaryNoSignalAttempt } from "./summary-no-signal-attempt";

describe("provider-neutral summary no-signal policy", () => {
  it("keeps the original no-signal draft and model lineage", () => {
    const input = { policy: { rulesVersion: "synthetic-rules" } } as SummaryModelInput;
    const route = {
      provider: "agent-runtime",
      model: "synthetic-model",
      promptVersion: "synthetic-prompt",
      schemaVersion: "summary.artifact.v1",
    } as SummaryModelRoute;
    const usage = { inputTokens: 0, outputTokens: 96, estimatedCostUsd: 0 };
    const result = buildSummaryNoSignalAttempt({
      input, selectedRoute: route, evalDatasetVersion: "synthetic-eval", usage,
    });
    expect(result.route).toBe(route);
    expect(result.draft).toMatchObject({
      headline: "No reliable signal yet",
      qualityFlags: ["no_signal", "limited_sources"],
      confidence: { level: "none", score: 0 },
      lineage: { providerVersion: "agent-runtime", evalDatasetVersion: "synthetic-eval" },
      usage,
    });
  });
});
