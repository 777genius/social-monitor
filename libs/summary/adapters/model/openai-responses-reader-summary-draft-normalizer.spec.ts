import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { dailyEvidenceSelection } from
  "../../domain/policies/reader-summary-publication-evidence-test-fixtures";
import type { ReaderSummaryModelInput } from "../../ports";
import { normalizeOpenAiReaderSummaryDraft } from
  "./openai-responses-reader-summary-draft-normalizer";

describe("normalizeOpenAiReaderSummaryDraft", () => {
  it("uses normalized story copy when canonical and legacy narrative are empty", () => {
    const evidence = dailyEvidenceSelection(0);
    const input: ReaderSummaryModelInput = {
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
        rulesVersion: "test-no-signal-fallback",
      },
      requestedAt: evidence.sourceWindow.endedAt,
    };

    const draft = normalizeOpenAiReaderSummaryDraft({
      headline: "A cited story remains publishable",
      executiveSummary: "",
      narrativeSections: [],
      topStories: [],
      qualityFlags: [],
      confidence: {
        level: "none",
        score: 0,
        rationale: "No evidence passed the publication slate.",
      },
      noSignalReason: null,
    }, input, {
      provider: "offline-test",
      model: "fixture",
      promptVersion: "test",
      schemaVersion: "reader_summary.artifact.v1",
    }, {
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
    }, "test");

    expect(draft.executiveSummary).toBe(draft.topStories[0]?.summary);
    expect(draft.executiveSummary.trim()).not.toBe("");
  });
});
