import type { ProviderReaderSummaryAttempt } from "../../ports";
import { validateAgentRuntimeReaderSummaryProviderResponse } from "./agent-runtime-reader-summary-response-validation";
import { assertOpenAiReaderSummaryDraftShape } from "./reader-summary-draft-shape-contract";

/** Small synthetic fully-controlled boundary input; no SDK or live workspace data. */
const attempt = (): ProviderReaderSummaryAttempt => ({
  route: {
    provider: "agent-runtime",
    model: "codex:synthetic-model:high",
    promptVersion: "synthetic-prompt",
    schemaVersion: "reader_summary.artifact.v1",
  },
  draft: {
    headline: "Grounded daily summary",
    executiveSummary: "Evidence supports this summary.",
    confidence: { score: 0.7 },
    topStories: [],
    qualityFlags: ["no_signal"],
  } as unknown as ProviderReaderSummaryAttempt["draft"],
});

const invalid = (value: ProviderReaderSummaryAttempt, message: string): void => {
  expect(validateAgentRuntimeReaderSummaryProviderResponse(value)).toEqual({
    ok: false,
    failure: { kind: "invalid_schema", retryable: false, message },
  });
};

describe("reader summary draft and agent-runtime response trust", () => {
  it("accepts a canonical no-signal normalized attempt", () => {
    expect(() => assertOpenAiReaderSummaryDraftShape(attempt().draft)).not.toThrow();
    expect(validateAgentRuntimeReaderSummaryProviderResponse(attempt())).toEqual({ ok: true });
  });

  it("rejects missing headline and executive summary before checking the route", () => {
    const base = attempt();
    invalid({ ...base, route: { ...base.route, schemaVersion: "wrong" as typeof base.route.schemaVersion },
      draft: { ...base.draft, headline: "" } },
    "Reader summary draft must include headline and executive summary");
    invalid({ ...base, draft: { ...base.draft, executiveSummary: "  " } },
      "Reader summary draft must include headline and executive summary");
  });

  it("rejects confidence outside its inclusive range", () => {
    const base = attempt();
    for (const score of [-0.01, 1.01]) {
      invalid({ ...base, draft: { ...base.draft, confidence: {
        ...base.draft.confidence, score,
      } } }, "Reader summary confidence score must be between 0 and 1");
    }
    for (const score of [0, 1]) {
      expect(validateAgentRuntimeReaderSummaryProviderResponse({
        ...base, draft: { ...base.draft, confidence: { ...base.draft.confidence, score } },
      })).toEqual({ ok: true });
    }
  });

  it("requires no_signal when the draft has zero stories", () => {
    const base = attempt();
    invalid({ ...base, draft: { ...base.draft, qualityFlags: [] } },
      "Reader summary draft without top stories must be marked no_signal");
  });

  it("rejects schema and provider route spoofing without retry", () => {
    const base = attempt();
    invalid({ ...base, route: { ...base.route, schemaVersion: "wrong" as typeof base.route.schemaVersion } },
      "Unsupported reader summary schema version");
    invalid({ ...base, route: { ...base.route, provider: "unknown" as typeof base.route.provider } },
      "Unexpected reader summary provider route");
  });
});
