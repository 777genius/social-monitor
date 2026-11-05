import { createHash } from "node:crypto";
import { ReaderSummaryArtifact, READER_SUMMARY_DAILY_EDITORIAL_VERSION,
  readReaderSummaryDailyEditorialPlan, readerSummaryDailyEditorialCoveragePlan } from "../../domain";
import { dailyDigestFixture, dailyProviderDraft } from "./reader-summary-daily-digest.fixture";
import { OpenAiResponsesReaderSummaryModelAdapter } from "./openai-responses-reader-summary-model.adapter";
import { jsonResponse } from "./reader-summary-model-promotion.spec-support";
import { buildReaderSummaryDraftWithPromotionContent } from "../../features/execute-reader-summary-job/reader-summary-promotion-content";
import { buildReaderSummaryModelArtifact } from "../../features/execute-reader-summary-job/reader-summary-model-artifact";
import { dailyGenerationPublicationMatches } from "../persistence/prisma/reader-summary-daily-generation-publication-guard";
import { normalizeReaderSummaryArtifactPayload } from "../persistence/prisma/prisma-reader-summary-artifact-payload";
import { serializeReaderSummaryArtifact } from "../persistence/prisma/prisma-reader-summary-json";
import type { ReaderSummaryModelInput } from "../../ports";

it("editor and writer use the same thirty inputs; the saved plan guards publication", async () => {
  const { input, evidence, manifest, snapshots, job } = await dailyDigestFixture();
  const frozen = evidence.dailyGenerationInput!;
  const picked = [frozen.selected[17]!, frozen.selected[8]!, frozen.selected[1]!, frozen.selected[4]!];
  const rawPlan = { version: READER_SUMMARY_DAILY_EDITORIAL_VERSION,
    topics: [
      { title: "The important late-ranked event", why: "High practical impact", depth: "detailed",
        feedItemIds: [picked[0]!.feedItemId, picked[1]!.feedItemId] },
      { title: "Independent event", why: "Useful feature", depth: "brief",
        feedItemIds: [picked[2]!.feedItemId] },
      { title: "Weak early report", why: "Only an unverified mention", depth: "brief",
        feedItemIds: [picked[3]!.feedItemId] },
    ] };
  const plan = readReaderSummaryDailyEditorialPlan(rawPlan, frozen);
  const citation = (id: string) => `c${frozen.selected.findIndex(item => item.feedItemId === id) + 1}`;
  const providerDraft = (writer: ReaderSummaryModelInput) => {
    const planned = [writer.coveragePlan.lead!, ...writer.coveragePlan.secondary];
    return { ...dailyProviderDraft(writer),
      narrativeSections: planned.map((topic, index) => ({
        kind: index === 0 ? "lead" : "secondary_signal",
        storyClusterId: topic.clusterId,
        title: index === 0 ? "Main development" : `Secondary development ${index}`,
        text: index === 2
          ? "A monitored account mentions an unconfirmed report; no independent source verifies the claim."
          : "The cited source describes a distinct practical engineering workflow capability and its limitations.",
        citationIds: topic.feedItemIds.slice(0, 3).map(citation),
      })),
      topStories: planned.map((topic, index) => ({
        storyClusterId: topic.clusterId, title: `Event ${index + 1}`,
        summary: "The monitored source describes this distinct workflow development, with remaining qualifications attributed to the original author.",
        interestIds: topic.interestIds, providerKeys: topic.providerKeys,
        citationIds: [citation(topic.feedItemIds[0]!)],
      })),
    };
  };
  const requests: { name: string; prompt: string; model: string }[] = [];
  const writerInput = { current: undefined as ReaderSummaryModelInput | undefined };
  const adapter = new OpenAiResponsesReaderSummaryModelAdapter({
    apiKey: "fixture-only-key",
    fetchFn: async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as {
        input: string; model: string; text: { format: { name: string } };
      };
      requests.push({ name: request.text.format.name, prompt: request.input, model: request.model });
      return jsonResponse({ output_text: JSON.stringify(
        request.text.format.name === "social_monitor_reader_summary_daily_editor"
          ? rawPlan : providerDraft(writerInput.current!),
      ) });
    },
  });
  const policy = { preferredProvider: "openai-responses", maxInputTokens: 100000,
    maxOutputTokens: 16000, maxEstimatedCostUsd: 5 };
  const budget = { remainingTokens: 120000, remainingCostUsd: 10 };
  const editorRoute = { ...adapter.route(input, policy, budget), model: "fixture-editor-model" };
  const editor = await adapter.planDaily(input, editorRoute);
  expect(editor.plan).toEqual(plan);
  writerInput.current = { ...input, dailyEditorialPlan: editor.plan,
    coveragePlan: readerSummaryDailyEditorialCoveragePlan(evidence, editor.plan),
    policy: { ...input.policy, maxStories: 10 } };
  const attempt = await adapter.generate(writerInput.current, adapter.route(writerInput.current, policy, budget));
  expect(requests).toHaveLength(2);
  expect(requests[0]!.model).toBe("fixture-editor-model");
  expect(JSON.parse(requests[0]!.prompt).evidence).toHaveLength(30);
  expect(JSON.parse(requests[1]!.prompt).evidence).toHaveLength(30);
  expect(writerInput.current.coveragePlan.lead?.clusterId).toBe(picked[0]!.storyId);
  const draft = buildReaderSummaryDraftWithPromotionContent(evidence, attempt.draft);
  const proof = { plan: editor.plan,
    inputSha256: createHash("sha256").update(JSON.stringify(frozen.selected)).digest("hex"),
    editor: editor.receipt, writerPlanSha256: attempt.dailyEditorialWriterPlanSha256! };
  const artifact = buildReaderSummaryModelArtifact({ snapshot: job.toSnapshot(),
    readerSummaryId: "daily-editorial-test", generatedAt: input.requestedAt,
    modelEvidence: evidence, contextArtifacts: [], draft,
    dailyGenerationReceipt: attempt.dailyGenerationReceipt, dailyEditorialProof: proof });
  expect(draft.content.sourceMix.reduce((sum, source) => sum + source.itemCount, 0)).toBe(30);
  const serialized = serializeReaderSummaryArtifact(artifact);
  const fallback = { id: "daily-editorial-test", tenantId: input.tenantId, workspaceId: input.workspaceId,
    scopeType: "workspace", interestId: null, cadence: input.period.cadence,
    periodStartedAt: input.period.startedAt, periodEndedAt: input.period.endedAt,
    periodTimezone: input.period.timezone, userId: null, subscriptionId: null,
    headline: draft.headline, summaryText: null, createdAt: input.requestedAt };
  const read = ReaderSummaryArtifact.rehydrate(normalizeReaderSummaryArtifactPayload(serialized, fallback));
  expect(read.toSnapshot().dailyEditorialProof).toEqual(proof);
  const params = { manifest, manifestSha256: frozen.manifestSha256,
    periodKey: input.period.periodKey,
    identity: { tenantId: input.tenantId, workspaceId: input.workspaceId, scope: input.scope },
    snapshots, artifact: read.toSnapshot() };
  expect(dailyGenerationPublicationMatches(params)).toBe(true);
  for (const broken of [
    { ...proof, inputSha256: "0".repeat(64) },
    { ...proof, editor: { ...proof.editor, requestSha256: "0".repeat(64) } },
    { ...proof, writerPlanSha256: "0".repeat(64) },
    { ...proof, plan: { ...proof.plan, topics: [...proof.plan.topics].reverse() } },
  ]) {
    expect(dailyGenerationPublicationMatches({ ...params,
      artifact: { ...params.artifact, dailyEditorialProof: broken } })).toBe(false);
  }
  expect(() => normalizeReaderSummaryArtifactPayload({ ...serialized,
    dailyEditorialProof: null }, fallback)).toThrow();
});
