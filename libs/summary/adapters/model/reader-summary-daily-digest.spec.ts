import { ok } from "@social-monitor/shared-kernel";
import { emptyReaderSummaryTopicMap } from "../../domain";
import { BuildReaderSummaryTopicMapUseCase } from "../../features/build-reader-summary-topic-map/build-reader-summary-topic-map.use-case";
import { withReaderSummaryTopicMap } from "../../features/execute-reader-summary-job/execute-reader-summary-job-support";
import { dailyReaderSummaryGenerationEvidence } from "../evidence/reader-summary-daily-generation-evidence";
import { buildAdaptiveReaderSummaryEvidence } from "./openai-responses-reader-summary-adaptive-evidence";
import { buildReaderSummaryCoveragePlan } from "../../domain";
import { serializeReaderSummaryArtifact } from "../persistence/prisma/prisma-reader-summary-json";
import { normalizeReaderSummaryArtifactPayload } from "../persistence/prisma/prisma-reader-summary-artifact-payload";
import { dailyGenerationPublicationMatches } from "../persistence/prisma/reader-summary-daily-generation-publication-guard";
import { createHash } from "node:crypto";
import { AgentRuntimeReaderSummaryModelAdapter } from "./agent-runtime-reader-summary-model.adapter";
import { CapturingAgentRuntimeClient } from "./agent-runtime-reader-summary-model.spec-support";
import { ReaderSummaryArtifact, validateDailyEditorialPlan, dailyEditorialCoveragePlan } from "../../domain";
import { buildReaderSummaryDraftWithPromotionContent } from "../../features/execute-reader-summary-job/reader-summary-promotion-content";
import { buildReaderSummaryModelArtifact } from "../../features/execute-reader-summary-job/reader-summary-model-artifact";
import { buildReaderSummaryCoverageView } from "../../features/shared/reader-summary-coverage-presenter";
import { readerSummaryDailyInputReceipt } from "./reader-summary-daily-input-receipt";
import { buildDailyEditorialPrompt } from "./reader-summary-daily-editorial-model";
import { dailyDigestFixture, dailyPromotionFixture, dailyProviderDraft, generateDailyFixture } from "./reader-summary-daily-digest.fixture";

it("sends exactly thirty Likes inputs, retains a non-promoted narrative and keeps the separate sealed board", async () => {
  const { input, evidence, manifest, snapshots, job } = await dailyDigestFixture();
  const { attempt, request } = await generateDailyFixture(input);
  const payload = JSON.parse(request.input) as { evidence: { feedItemId: string }[]; additionalEvidence: unknown[]; additionalStoryClusters: unknown[] };
  const selected = evidence.dailyGenerationInput!.selected;
  expect(payload.evidence.map(item => item.feedItemId)).toEqual(selected.map(entry => entry.feedItemId));
  expect(payload.evidence).toHaveLength(30);
  expect(payload.additionalEvidence).toEqual([]);
  expect(payload.additionalStoryClusters).toEqual([]);
  expect(request.input).not.toContain("board-only source text");
  expect(attempt.dailyGenerationReceipt).toEqual(readerSummaryDailyInputReceipt(request.input, evidence.dailyGenerationInput));
  expect(attempt.dailyGenerationReceipt!.evidence).toHaveLength(30);
  const publication = buildReaderSummaryDraftWithPromotionContent(evidence, attempt.draft);
  expect(publication.content.narrativeSections?.filter(section => section.kind === "secondary_signal")).toHaveLength(5);
  expect(publication.content.narrativeSections?.[0]?.citationIds).toEqual(["c1", "c2"]);
  expect(publication.content.sourceMix.reduce((sum, source) => sum + source.itemCount, 0)).toBe(30);
  expect(publication.content.topReads).toHaveLength(1);
  expect(publication.content.topReads[0]?.summary).toBeUndefined();
  expect(publication.content.headline).toBe(attempt.draft.headline);

  const topicBuilder = new BuildReaderSummaryTopicMapUseCase();
  const topicCall = jest.spyOn(topicBuilder, "execute").mockResolvedValue(ok(emptyReaderSummaryTopicMap()));
  await withReaderSummaryTopicMap({ topicMapBuilder: topicBuilder, snapshot: job.toSnapshot(), evidence, draft: publication });
  expect(topicCall.mock.calls[0]![0].selectedEvidence.map(item => item.feedItemId)).toEqual(selected.map(entry => entry.feedItemId));
  expect(topicCall.mock.calls[0]![0].evidenceAdmission).toEqual({ selectionStrategy: "jev_primary_v3",
    admittedCandidateIds: selected.map(entry => entry.feedItemId) });
  expect(topicCall.mock.calls[0]![0].citationMap.map(item => item.feedItemId)).toEqual(selected.map(entry => entry.feedItemId));
  const readerSummaryId = "daily-input-test-artifact";
  const artifact = buildReaderSummaryModelArtifact({ snapshot: job.toSnapshot(), readerSummaryId,
    generatedAt: input.requestedAt, modelEvidence: evidence, contextArtifacts: [], draft: publication,
    dailyGenerationReceipt: attempt.dailyGenerationReceipt });
  const serialized = serializeReaderSummaryArtifact(artifact);
  const fallback = { id: readerSummaryId, tenantId: input.tenantId, workspaceId: input.workspaceId,
    scopeType: "workspace", interestId: null, cadence: input.period.cadence,
    periodStartedAt: input.period.startedAt, periodEndedAt: input.period.endedAt, periodTimezone: input.period.timezone,
    userId: null, subscriptionId: null, headline: publication.headline, summaryText: null, createdAt: input.requestedAt };
  const loaded = ReaderSummaryArtifact.rehydrate(normalizeReaderSummaryArtifactPayload(serialized, fallback));
  expect(loaded.toSnapshot().dailyGenerationInput).toEqual(artifact.toSnapshot().dailyGenerationInput);
  expect(JSON.parse(JSON.stringify(loaded.toSnapshot().content))).toEqual(JSON.parse(JSON.stringify(artifact.toSnapshot().content)));
  for (const invalid of [null, { policyVersion: "unknown" }, { ...serialized.dailyGenerationInput as object, selected: [] }]) {
    expect(() => normalizeReaderSummaryArtifactPayload({ ...serialized, dailyGenerationInput: invalid }, fallback)).toThrow();
  }
  const guard = { manifest, manifestSha256: evidence.dailyGenerationInput!.manifestSha256,
    periodKey: input.period.periodKey, identity: { tenantId: input.tenantId, workspaceId: input.workspaceId, scope: input.scope },
    snapshots, artifact: loaded.toSnapshot() };
  const reconstructed = dailyReaderSummaryGenerationEvidence(guard);
  const { sent: _sent, ...actualProof } = loaded.toSnapshot().dailyGenerationInput!;
  expect(actualProof).toEqual(reconstructed.proof);
  const reconstructedSelection = { rankingPolicyVersion: "daily-input", sourceWindow: guard.artifact.sourceWindow,
    selectedEvidence: reconstructed.selectedEvidence, clusters: reconstructed.clusters, dailyGenerationInput: reconstructed.proof };
  const expectedSent = buildAdaptiveReaderSummaryEvidence(reconstructedSelection, buildReaderSummaryCoveragePlan(reconstructedSelection));
  expect(_sent!.evidence).toEqual(expectedSent.map(item => ({ feedItemId: item.feedItemId,
    sha256: createHash("sha256").update(JSON.stringify(item)).digest("hex") })));
  expect(dailyGenerationPublicationMatches(guard)).toBe(true);
  for (const key of ["sourceSnapshotSha256", "inputSha256", "storyId", "nativeCount", "engagementObservedAt"] as const) {
    const proof = loaded.toSnapshot().dailyGenerationInput!;
    const changed = { ...proof.selected[0]!, [key]: key === "nativeCount" ? 999999 : "tampered" };
    expect(dailyGenerationPublicationMatches({ ...guard, artifact: { ...guard.artifact,
      dailyGenerationInput: { ...proof, selected: [changed, ...proof.selected.slice(1)] } } })).toBe(false);
  }
  const proof = loaded.toSnapshot().dailyGenerationInput!;
  expect(dailyGenerationPublicationMatches({ ...guard, artifact: { ...guard.artifact,
    dailyGenerationInput: { ...proof, selected: [...proof.selected].reverse() } } })).toBe(false);
  expect(dailyGenerationPublicationMatches({ ...guard, artifact: { ...guard.artifact,
    dailyGenerationInput: { ...proof, sent: { ...proof.sent!, evidence: proof.sent!.evidence.map((entry, index) =>
      index === 0 ? { ...entry, sha256: "0".repeat(64) } : entry) } } } })).toBe(false);
  expect(dailyGenerationPublicationMatches({ ...guard, manifest: { ...manifest, cutoffAt: "2026-09-21T00:00:00.000001Z" } })).toBe(false);
  expect(artifact.toSnapshot().storyClusters).toHaveLength(1);
  expect(artifact.toSnapshot().dailyGenerationInput!.selected).toHaveLength(30);
  expect(new Set(artifact.toSnapshot().citationMap.map(citation => citation.citationId)).size).toBe(31);
  const coverage = buildReaderSummaryCoverageView(artifact.toSnapshot(), { topReads: [], sourceMix: publication.content.sourceMix },
    { status: "fresh", checkedAt: "2026-09-21T01:00:00.000Z" }, undefined);
  expect(coverage.selectedFeedItemCount).toBe(30);
  expect(coverage.providerBreakdown.reduce((sum, provider) => sum + provider.selectedFeedItemCount, 0)).toBe(30);
});

 it("binds the receipt to the exact AgentRuntime command and its thirty evidence objects", async () => {
  const { input } = await dailyDigestFixture();
  const client = new CapturingAgentRuntimeClient({ status: "completed", structuredOutput: dailyProviderDraft(input), warnings: [] });
  const adapter = new AgentRuntimeReaderSummaryModelAdapter({ client, agentProvider: "codex" });
  const route = adapter.route(input, { preferredProvider: "agent-runtime", maxInputTokens: 100000,
    maxOutputTokens: 16000, maxEstimatedCostUsd: 5 }, { remainingTokens: 120000, remainingCostUsd: 10 });
  const result = await adapter.generate(input, route);
  expect(client.commands).toHaveLength(1);
  const command = client.commands[0]!;
  const payload = JSON.parse(command.prompt) as { evidence: { feedItemId: string }[]; additionalEvidence: unknown[] };
  expect(payload.evidence.map(item => item.feedItemId)).toEqual(input.evidence.dailyGenerationInput!.selected.map(item => item.feedItemId));
  expect(payload.evidence).toHaveLength(30);
  expect(payload.additionalEvidence).toEqual([]);
  expect(command.prompt).not.toContain("board-only source text");
  expect(result.dailyGenerationReceipt).toEqual({ payloadSha256: createHash("sha256").update(command.prompt).digest("hex"),
    evidence: payload.evidence.map(item => ({ feedItemId: item.feedItemId,
      sha256: createHash("sha256").update(JSON.stringify(item)).digest("hex") })) });
});

it("fails closed with a typed unsupported outcome before narrative dispatch when no board is promotable", async () => {
  const fixture = await dailyPromotionFixture(false);
  expect(fixture.outcome).toEqual({ kind: "unsupported_daily_digest", reason: "no_promotion_board" });
  expect(fixture.presentation.attempted).toBe(0);
});

it("publishes ten source-bound editorial topics with a late lead and cross-cluster group", async () => {
  const { input, evidence, manifest, snapshots, job } = await dailyDigestFixture();
  const selected = evidence.dailyGenerationInput!.selected;
  const plan = validateDailyEditorialPlan({
    version: "reader_summary.daily_editorial.v1",
    topics: [
      { title: "Late important event", why: "More significant than popularity rank",
        depth: "detailed", feedItemIds: [selected[19]!.feedItemId, selected[26]!.feedItemId] },
      ...selected.slice(0, 9).map((entry, index) => ({
        title: `Distinct story ${index + 1}`, why: "Concrete independent value",
        depth: index < 3 ? "detailed" : "brief",
        feedItemIds: [entry.feedItemId],
      })),
    ],
  }, evidence.dailyGenerationInput!);
  const writer = { ...input, dailyEditorialPlan: plan,
    coveragePlan: dailyEditorialCoveragePlan(plan, evidence),
    policy: { ...input.policy, maxStories: plan.topics.length } };
  const { attempt, request } = await generateDailyFixture(writer);
  const payload = JSON.parse(request.input) as { evidence: readonly { feedItemId: string }[];
    dailyEditorialPlan: typeof plan };
  expect(payload.evidence.map(item => item.feedItemId)).toEqual(selected.map(item => item.feedItemId));
  expect(payload.dailyEditorialPlan).toEqual(plan);
  expect(attempt.draft.content?.narrativeSections?.length).toBe(10);
  expect(attempt.draft.topStories.map(item => item.storyClusterId))
    .toEqual([writer.coveragePlan.lead!, ...writer.coveragePlan.secondary].map(item => item.clusterId));
  const draft = buildReaderSummaryDraftWithPromotionContent(evidence, attempt.draft);
  const editorOutputSha256 = createHash("sha256").update(JSON.stringify(plan)).digest("hex");
  const artifact = buildReaderSummaryModelArtifact({
    snapshot: job.toSnapshot(), readerSummaryId: "daily-editorial-test-artifact",
    generatedAt: writer.requestedAt, modelEvidence: evidence, contextArtifacts: [],
    draft, dailyGenerationReceipt: attempt.dailyGenerationReceipt,
    dailyEditorialPlan: { plan,
      frozenManifestSha256: evidence.dailyGenerationInput!.manifestSha256,
      editorRequestSha256: createHash("sha256").update(buildDailyEditorialPrompt(input)).digest("hex"),
      editorOutputSha256 },
  });
  const saved = artifact.toSnapshot();
  expect(saved.content?.sourceMix.reduce((sum, source) => sum + source.itemCount, 0)).toBe(30);
  expect(saved.dailyEditorialPlan?.plan.topics).toHaveLength(10);
  expect(saved.content?.narrativeSections?.filter(section => section.kind === "secondary_signal")).toHaveLength(9);
  const guard = { manifest, manifestSha256: evidence.dailyGenerationInput!.manifestSha256,
    periodKey: input.period.periodKey,
    identity: { tenantId: input.tenantId, workspaceId: input.workspaceId, scope: input.scope },
    snapshots, artifact: saved };
  expect(dailyGenerationPublicationMatches(guard)).toBe(true);
  expect(dailyGenerationPublicationMatches({ ...guard,
    artifact: { ...saved, dailyEditorialPlan: { ...saved.dailyEditorialPlan!,
      editorOutputSha256: "0".repeat(64) } } })).toBe(false);
});
