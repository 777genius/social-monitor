import { ReaderSummaryJob, buildReaderSummaryCoveragePlan, readerSummaryWorkspaceManifestSha256 } from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";
import { scoredRedditCandidate, workspaceSetup, TestPresentation } from "../evidence/relevance-reader-summary-v3-promotion.fixture";
import { OpenAiResponsesReaderSummaryModelAdapter } from "./openai-responses-reader-summary-model.adapter";
import { jsonResponse } from "./reader-summary-model-promotion.spec-support";

export async function dailyPromotionFixture(board = true) {
  const candidates = Array.from({ length: 31 }, (_, index) => ({
    ...scoredRedditCandidate(index + 1, 1000 - index, "noise"),
    title: `Distinct development ${index + 1}`,
    body: `Development ${index + 1} adds a specific workflow capability with source-local constraints ${index + 1}.`,
  }));
  if (board) candidates.push({ ...scoredRedditCandidate(99, 1, "useful"),
    title: "Independent board-only event", body: "This board-only source text must never enter the narrative model request." });
  const presentation = new TestPresentation();
  const fixture = workspaceSetup(candidates, undefined, presentation);
  const manifestSha256 = readerSummaryWorkspaceManifestSha256(fixture.manifest);
  const job = ReaderSummaryJob.rehydrate({ ...fixture.job.toSnapshot(), selectionStrategy: "jev_primary_v3",
    preparationManifest: fixture.manifest, preparationManifestSha256: manifestSha256,
    preparationReadyAt: new Date(fixture.manifest.cutoffAt),
    preparationConfig: { schemaVersion: "reader_summary_preparation_config.v2", interests: fixture.manifest.interests },
  });
  const outcome = await fixture.subject.build({ job, manifest: fixture.manifest });
  return { outcome, job, presentation, manifest: fixture.manifest,
    snapshots: new Map(fixture.assessments.map(value => [value.id, value.input.snapshot])) };
}

export async function dailyDigestFixture() {
  const fixture = await dailyPromotionFixture();
  const { outcome, job } = fixture;
  if (outcome.kind !== "ready") throw new Error(`Unexpected fixture outcome: ${outcome.kind}`);
  const evidence = outcome.evidence;
  const input: ReaderSummaryModelInput = {
    tenantId: job.toSnapshot().tenantId, workspaceId: job.toSnapshot().workspaceId,
    scope: { type: "workspace" }, period: job.toSnapshot().period,
    evidence, coveragePlan: buildReaderSummaryCoveragePlan(evidence), contextArtifacts: [],
    policy: { language: "en", format: "executive_brief", tone: "analytical", maxStories: 6,
      includeRisks: true, includeInterestHighlights: true, includeRepeatedSignals: true,
      dedupeStrategy: "canonical_url_then_title", rulesVersion: "reader_summary.rules.test.v1" },
    requestedAt: job.toSnapshot().requestedAt,
  };
  return { input, evidence, job, manifest: fixture.manifest, snapshots: fixture.snapshots };
}

export function dailyProviderDraft(input: ReaderSummaryModelInput) {
  const ordinary = input.evidence.dailyGenerationInput!.selected;
  const planned = [input.coveragePlan.lead!, ...input.coveragePlan.secondary];
  const citation = (id: string) => `c${ordinary.findIndex(entry => entry.feedItemId === id) + 1}`;
  return {
        headline: "Distinct developments broaden daily engineering workflows",
        executiveSummary: "Several separate source-reported developments affect engineering work.",
        narrativeSections: input.dailyEditorialPlan === undefined || input.dailyEditorialPlan.version === "reader_summary.daily_editorial.v1" ? [{ kind: "lead", title: "Daily developments",
          text: "Separate source-reported developments introduce distinct capabilities and limitations across engineering workflows.",
          storyClusterId: input.dailyEditorialPlan === undefined ? null : planned[0]!.clusterId,
          citationIds: input.dailyEditorialPlan === undefined
            ? [citation(planned[0]!.feedItemIds[0]!), citation(planned[1]!.feedItemIds[0]!)]
            : planned[0]!.feedItemIds.slice(0, 3).map(citation) },
        ...planned.slice(1).map((item, index) => ({ kind: "secondary_signal", title: `Development ${index + 2}`,
          text: `Source ${index + 2} describes a distinct capability and its source-local constraints for this engineering workflow.`,
          storyClusterId: item.clusterId, citationIds: [citation(item.feedItemIds[0]!)] }))] : [{ kind: "lead", title: "The day's engineering picture",
          text: "The supplied reports describe complementary engineering capabilities with distinct source-local limitations.",
          storyClusterId: null, citationIds: planned.slice(0, 2).map(item => citation(item.feedItemIds[0]!)) },
          ...planned.slice(1, 4).map((_,index) => ({ kind: "secondary_signal", title: `Cross-cutting takeaway ${index+1}`,
            text: "These examples support evaluating practical capabilities and constraints without assuming broad adoption or independent confirmation.",
            storyClusterId: null, citationIds: planned.slice(0, 2).map(item => citation(item.feedItemIds[0]!)) }))],
        topStories: planned.map((item, index) => ({ storyClusterId: item.clusterId,
          title: `Specific development ${index + 1}`,
          summary: `Source ${index + 1} describes a concrete workflow capability and its specific constraints. The result remains source-reported and does not establish broad adoption.`,
          interestIds: item.interestIds, providerKeys: item.providerKeys,
          citationIds: [citation(item.feedItemIds[0]!)] })),
        interestHighlights: [], repeatedSignals: [], risksAndUnknowns: [], citationMap: [], qualityFlags: [],
        confidence: { level: "medium", score: 0.6, rationale: "Source-reported evidence." }, noSignalReason: null,
  };
}

export async function generateDailyFixture(input: ReaderSummaryModelInput) {
  let request: { input: string } | undefined;
  const adapter = new OpenAiResponsesReaderSummaryModelAdapter({ apiKey: "fixture-only-key",
    fetchFn: async (_url, init) => {
      request = JSON.parse(String(init?.body)) as { input: string };
      return jsonResponse({ output_text: JSON.stringify(dailyProviderDraft(input)) });
    } });
  const route = adapter.route(input, { preferredProvider: "openai-responses", maxInputTokens: 100000,
    maxOutputTokens: 16000, maxEstimatedCostUsd: 5 }, { remainingTokens: 120000, remainingCostUsd: 10 });
  const attempt = await adapter.generate(input, route);
  if (request === undefined) throw new Error("Expected one real adapter request to the fixture transport");
  return { attempt, request };
}

