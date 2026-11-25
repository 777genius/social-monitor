import { readerSummaryInput } from "./agent-runtime-reader-summary-model.spec-support";
import { buildReaderSummaryNoSignalAttempt } from "./reader-summary-no-signal-attempt";

describe("provider-neutral reader summary no-signal draft", () => {
  it("preserves the same no-signal copy and lineage across provider routes", () => {
    const fixture = readerSummaryInput();
    const input = {
      ...fixture,
      evidence: {
        ...fixture.evidence,
        selectedEvidence: [],
        clusters: [],
        editorialSlate: undefined,
      },
      coveragePlan: { ...fixture.coveragePlan, lead: undefined, secondary: [] },
    };
    const usage = { inputTokens: 0, outputTokens: 64, estimatedCostUsd: 0 };
    const route = {
      provider: "agent-runtime",
      model: "synthetic",
      promptVersion: "synthetic-prompt",
      schemaVersion: "reader_summary.artifact.v1",
    } as const;
    const attempt = buildReaderSummaryNoSignalAttempt({
      input,
      selectedRoute: route,
      evalDatasetVersion: "synthetic-eval",
      usage,
    });
    expect(attempt.route).toBe(route);
    expect(attempt.draft.qualityFlags).toContain("no_signal");
    expect(attempt.draft.usage).toEqual(usage);
    expect(attempt.draft.lineage.providerVersion).toBe("agent-runtime");
  });
});
