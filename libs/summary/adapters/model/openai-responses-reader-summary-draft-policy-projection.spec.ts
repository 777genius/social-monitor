import { normalizeOpenAiReaderSummaryEnabledSections } from "./openai-responses-reader-summary-draft-enabled-sections";
import { normalizeOpenAiReaderSummaryMandatoryQuality } from "./openai-responses-reader-summary-draft-mandatory-quality";
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
  it("composes optional sections before mandatory quality without mutating provider input", () => {
    const raw = Object.freeze({
      interestHighlights: Object.freeze([{ citationIds: Object.freeze([3]) }]),
      repeatedSignals: Object.freeze([{ citationIds: Object.freeze([3]) }]),
      risksAndUnknowns: Object.freeze([{ reason: "unsupported_reason" }]),
      qualityFlags: Object.freeze(["no_signal"]),
      confidence: null,
    });
    const params = { raw, input: makeInput(), citationMap: [], topStoryCount: 1 };
    const enabled = normalizeOpenAiReaderSummaryEnabledSections(params);
    const mandatory = normalizeOpenAiReaderSummaryMandatoryQuality(raw, 1);
    const combined = normalizeOpenAiReaderSummaryOptionalContent(params);

    expect(enabled).toEqual({ interestHighlights: [], repeatedSignals: [], risksAndUnknowns: [] });
    expect(mandatory.normalizedQualityFlags).toEqual([]);
    expect(mandatory.confidence).toMatchObject({ level: "low", score: 0.55 });
    expect(combined).toEqual({ ...enabled, ...mandatory });
    expect(Object.keys(combined)).toEqual([
      "interestHighlights", "repeatedSignals", "risksAndUnknowns",
      "normalizedQualityFlags", "confidence",
    ]);
    expect(raw.qualityFlags).toEqual(["no_signal"]);
    expect(raw.risksAndUnknowns[0]?.reason).toBe("unsupported_reason");
  });

  it("does not allow disabled optional fields to bypass mandatory fail-closed validation", () => {
    const raw = {
      risksAndUnknowns: [{ reason: "unknown_reason" }],
      qualityFlags: ["unrecognized_quality"],
    };
    expect(normalizeOpenAiReaderSummaryEnabledSections({
      raw, input: makeInput(), citationMap: [],
    })).toEqual({ interestHighlights: [], repeatedSignals: [], risksAndUnknowns: [] });
    expect(() => normalizeOpenAiReaderSummaryMandatoryQuality(raw, 0)).toThrow();
    expect(() => normalizeOpenAiReaderSummaryOptionalContent({
      raw, input: makeInput(), citationMap: [], topStoryCount: 0,
    })).toThrow();
  });
});
