import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import type { SummaryEvidenceSelection } from "../../domain";
import { dailyEvidenceSelection } from
  "../../domain/policies/reader-summary-publication-evidence-test-fixtures";
import type { ReaderSummaryModelInput } from "../../ports";
import { normalizeOpenAiReaderSummaryDraft } from
  "./openai-responses-reader-summary-draft-normalizer";

export const modelProse = "An author reports that the agent reused saved tool results during " +
  "one resumed session. The workflow avoided a repeated scan, but no controlled timings " +
  "were recorded; this does not establish a general performance improvement.";
export const metricReason = "Recorded Reddit score: 50.";

export const reasonEvidence = (): SummaryEvidenceSelection => {
  const evidence = dailyEvidenceSelection(0);
  return {
    ...evidence,
    selectedEvidence: evidence.selectedEvidence.map((item, index) => ({
      ...item,
      whyImportant: [index === 0 ? metricReason : "Recorded Hacker News points: 0."],
      bodyPreview: "The author tested an agent on one session without comparative timings.",
    })),
  };
};

export const rawReasonStory = (
  override: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> => ({
  storyClusterId: "story-publication-1",
  title: "Agent session reuse in one workflow",
  summary: modelProse,
  interestIds: ["interest-ai"],
  providerKeys: ["reddit"],
  citationIds: ["c1"],
  ...override,
});

export const normalizeReasonDraft = (
  evidence: SummaryEvidenceSelection,
  topStories: readonly Record<string, unknown>[],
) => {
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
    coveragePlan: {
      mode: "single_story",
      lead: {
        clusterId: evidence.clusters[0]!.id,
        role: "lead",
        score: 1,
        feedItemIds: [evidence.selectedEvidence[0]!.feedItemId],
        providerKeys: ["reddit"],
        interestIds: ["interest-ai"],
        whyImportant: [metricReason],
      },
      secondary: [],
    },
    contextArtifacts: [],
    policy: {
      language: "en", format: "executive_brief", tone: "analytical",
      maxStories: 8, includeRisks: false, includeInterestHighlights: false,
      includeRepeatedSignals: false, dedupeStrategy: "canonical_url_then_title",
      rulesVersion: "test-reason-provenance",
    },
    requestedAt: evidence.sourceWindow.endedAt,
  };
  return normalizeOpenAiReaderSummaryDraft({
    headline: "Agent sessions reuse saved tool results",
    executiveSummary: "Review the cited agent session report.",
    topStories,
    qualityFlags: [],
    confidence: { level: "low", score: 0.42, rationale: "One source only." },
  }, input, {
    provider: "offline-test", model: "fixture", promptVersion: "test",
    schemaVersion: "reader_summary.artifact.v1",
  }, { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 }, "test");
};
