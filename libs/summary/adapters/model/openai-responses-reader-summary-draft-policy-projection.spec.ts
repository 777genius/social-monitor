import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { dailyEvidenceSelection } from "../../domain/policies/reader-summary-publication-evidence-test-fixtures";
import type { ReaderSummaryModelInput } from "../../ports";
import { normalizeOpenAiReaderSummaryOptionalContent } from "./openai-responses-reader-summary-draft-policy-projection";

const makeInput = (
  overrides: Partial<ReaderSummaryModelInput["policy"]> = {},
): ReaderSummaryModelInput => {
  const evidence = dailyEvidenceSelection(0);
  return {
    tenantId: tenantId("test-tenant"),
    workspaceId: workspaceId("test-workspace"),
    scope: { type: "workspace" },
    period: {
      cadence: "daily",
      startedAt: evidence.sourceWindow.periodStartedAt!,
      endedAt: evidence.sourceWindow.periodEndedAt!,
      timezone: "UTC",
      periodKey: "test-day",
    },
    evidence,
    coveragePlan: { mode: "single_story", secondary: [] },
    contextArtifacts: [],
    policy: {
      language: "en",
      format: "executive_brief",
      tone: "analytical",
      maxStories: 8,
      includeRisks: false,
      includeInterestHighlights: false,
      includeRepeatedSignals: false,
      dedupeStrategy: "canonical_url_then_title",
      rulesVersion: "test-optional-content",
      ...overrides,
    },
    requestedAt: evidence.sourceWindow.endedAt,
  };
};

describe("OpenAI reader summary optional content projection", () => {
  it("applies no-signal flags and zero confidence to a storyless result", () => {
    const result = normalizeOpenAiReaderSummaryOptionalContent({
      raw: { qualityFlags: [], confidence: null },
      input: makeInput(),
      citationMap: [],
      topStoryCount: 0,
    });
    expect(result.normalizedQualityFlags).toEqual(["no_signal", "limited_sources"]);
    expect(result.confidence).toMatchObject({ level: "none", score: 0 });
  });

  it("removes stale no_signal and preserves the original cited-story default", () => {
    const result = normalizeOpenAiReaderSummaryOptionalContent({
      raw: { qualityFlags: ["no_signal"] },
      input: makeInput(),
      citationMap: [],
      topStoryCount: 1,
    });
    expect(result.normalizedQualityFlags).toEqual([]);
    expect(result.confidence).toMatchObject({ level: "low", score: 0.55 });
  });

  it("never decodes disabled optional provider sections", () => {
    const result = normalizeOpenAiReaderSummaryOptionalContent({
      raw: {
        risksAndUnknowns: [{ reason: "unexpected_reason", citationIds: ["untrusted"] }],
        repeatedSignals: [{ citationIds: [3] }],
        interestHighlights: [{ citationIds: [3] }],
      },
      input: makeInput(),
      citationMap: [],
      topStoryCount: 0,
    });
    expect(result.risksAndUnknowns).toEqual([]);
    expect(result.repeatedSignals).toEqual([]);
    expect(result.interestHighlights).toEqual([]);
  });

  it("still rejects invalid quality flags even with all optional sections disabled", () => {
    expect(() => normalizeOpenAiReaderSummaryOptionalContent({
      raw: { qualityFlags: ["not-a-supported-flag"] },
      input: makeInput(),
      citationMap: [],
      topStoryCount: 0,
    })).toThrow();
  });

  it("limits enabled risk citations to the trusted citation map", () => {
    const result = normalizeOpenAiReaderSummaryOptionalContent({
      raw: { risksAndUnknowns: [{ description: "Unverified claim", citationIds: ["untrusted"] }] },
      input: makeInput({ includeRisks: true }),
      citationMap: [],
      topStoryCount: 1,
    });
    expect(result.risksAndUnknowns).toEqual([{ description: "Unverified claim", citationIds: [], reason: undefined }]);
  });
});
