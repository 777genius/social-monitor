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
import { canonicalJsonSha256 } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import { AgentRuntimeReaderSummaryModelAdapter } from "./agent-runtime-reader-summary-model.adapter";
import { CapturingAgentRuntimeClient } from "./agent-runtime-reader-summary-model.spec-support";
import { ReaderSummaryArtifact, validateDailyEditorialPlan, dailyEditorialCoveragePlan, primaryReaderSummaryEvidence } from "../../domain";
import { buildReaderSummaryDraftWithPromotionContent } from "../../features/execute-reader-summary-job/reader-summary-promotion-content";
import { buildReaderSummaryModelArtifact } from "../../features/execute-reader-summary-job/reader-summary-model-artifact";
import { generateReaderSummaryWithDailyEditor } from "../../features/execute-reader-summary-job/reader-summary-daily-editorial-generation";
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
  expect(attempt.draft.citationMap).toHaveLength(31);
  const frozenIds = new Set(selected.map(item => item.feedItemId));
  const boardOnly = evidence.selectedEvidence.find(item => !frozenIds.has(item.feedItemId));
  expect(boardOnly).toBeDefined();
  expect(attempt.draft.citationMap[30]?.feedItemId).toBe(boardOnly?.feedItemId);
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
  // The promotion board is independent; the writer plan uses frozen narrative sources.
  const dailyEvidence = primaryReaderSummaryEvidence(evidence).selectedEvidence;
  const boardOnly = { ...evidence, selectedEvidence: [], dailyGenerationEvidence: dailyEvidence };
  expect(dailyEditorialCoveragePlan(plan, boardOnly).secondary).toHaveLength(9);
  const writer = { ...input, dailyEditorialPlan: plan,
    coveragePlan: dailyEditorialCoveragePlan(plan, evidence),
    policy: { ...input.policy, maxStories: plan.topics.length } };
  const { attempt, request } = await generateDailyFixture(writer);
  const payload = JSON.parse(request.input) as { evidence: readonly { feedItemId: string }[];
    dailyEditorialPlan: typeof plan };
  expect(payload.evidence.map(item => item.feedItemId)).toEqual(selected.map(item => item.feedItemId));
  expect(payload.dailyEditorialPlan).toEqual(plan);
  expect(attempt.dailyGenerationReceipt?.editorialPlanSha256).toBe(canonicalJsonSha256(plan));
  expect(attempt.draft.content?.narrativeSections?.length).toBe(10);
  expect(attempt.draft.topStories.map(item => item.storyClusterId))
    .toEqual([writer.coveragePlan.lead!, ...writer.coveragePlan.secondary].map(item => item.clusterId));
  const draft = buildReaderSummaryDraftWithPromotionContent(evidence, attempt.draft);
  const editorOutputSha256 = canonicalJsonSha256(plan);
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
  expect(dailyGenerationPublicationMatches({ ...guard,
    artifact: { ...saved, dailyEditorialPlan: { ...saved.dailyEditorialPlan!,
      editorRequestSha256: "0".repeat(64) } } })).toBe(false);
  expect(dailyGenerationPublicationMatches({ ...guard, artifact: { ...saved,
    dailyGenerationInput: { ...saved.dailyGenerationInput!, sent: {
      ...saved.dailyGenerationInput!.sent!, editorialPlanSha256: "0".repeat(64),
    } },
  } })).toBe(false);
  const frozenIds = new Set(selected.map(entry => entry.feedItemId));
  const outsideCitation = saved.citationMap.find(citation =>
    !frozenIds.has(citation.feedItemId))?.citationId;
  expect(outsideCitation).toBeDefined();
  expect(() => ReaderSummaryArtifact.rehydrate({ ...saved,
    interestHighlights: [{ interestId: "unplanned", title: "Outside story",
      summary: "The writer never received this board-only source.",
      citationIds: [outsideCitation!] }],
  })).toThrow("Daily narrative cites evidence outside actual model input");
  expect(() => ReaderSummaryArtifact.rehydrate({ ...saved,
    risksAndUnknowns: [{ description: "Unsupported risk",
      citationIds: [outsideCitation!] }],
  })).toThrow("Daily narrative cites evidence outside actual model input");
  const invalidAppendix = {
    id: "github-trending", kind: "watch" as const, title: "Forged appendix",
    text: "Unverified GitHub claim", citationIds: ["c1"],
  };
  expect(() => ReaderSummaryArtifact.rehydrate({ ...saved, content: {
    ...saved.content!, narrativeSections: [
      ...(saved.content?.narrativeSections ?? []), invalidAppendix,
    ],
  } })).toThrow("Daily editorial GitHub appendix is invalid");
  const invalidLead = saved.content?.narrativeSections?.map(section =>
    section.kind === "lead" ? { ...section, citationIds: ["c1"] } : section) ?? [];
  expect(() => ReaderSummaryArtifact.rehydrate({ ...saved,
    content: { ...saved.content!, narrativeSections: invalidLead },
  })).toThrow("Daily editorial topic cites sources outside its plan");
});


it("binds daily writer citations to the frozen top-30 even without matching board evidence", async () => {
  const { input, evidence } = await dailyDigestFixture();
  const frozen = evidence.dailyGenerationInput!;
  const lateSource = frozen.selected[19]!;
  const plan = validateDailyEditorialPlan({
    version: "reader_summary.daily_editorial.v1",
    topics: [{ title: "Late important story", why: "Relevant despite the popularity position",
      depth: "detailed", feedItemIds: [lateSource.feedItemId] }],
  }, frozen);
  const narrativeOnly = { ...evidence, selectedEvidence: [],
    dailyGenerationEvidence: primaryReaderSummaryEvidence(evidence).selectedEvidence };
  const writer = { ...input, evidence: narrativeOnly, dailyEditorialPlan: plan,
    coveragePlan: dailyEditorialCoveragePlan(plan, narrativeOnly),
    policy: { ...input.policy, maxStories: 1 } };
  const { attempt, request } = await generateDailyFixture(writer);
  const payload = JSON.parse(request.input) as {
    coveragePlan: { lead: { citationIds: readonly string[] } };
    evidence: readonly { feedItemId: string; citationId: string }[];
  };
  expect(payload.evidence).toHaveLength(30);
  expect(payload.coveragePlan.lead.citationIds).toEqual(["c20"]);
  expect(payload.evidence[19]).toMatchObject({
    feedItemId: lateSource.feedItemId, citationId: "c20",
  });
  expect(attempt.draft.topStories[0]?.citationIds).toEqual(["c20"]);
  expect(attempt.draft.citationMap[19]?.feedItemId).toBe(lateSource.feedItemId);
});

it("calls the attested daily editor once with all frozen sources and their native metrics", async () => {
  const { input, evidence } = await dailyDigestFixture();
  const selected = evidence.dailyGenerationInput!.selected;
  const rawPlan = { version: "reader_summary.daily_editorial.v1",
    topics: [{ title: "Important later event", why: "Practical impact is high",
      depth: "detailed", feedItemIds: [selected[19]!.feedItemId] }] };
  const client = new CapturingAgentRuntimeClient({
    status: "completed", structuredOutput: rawPlan, warnings: [],
  });
  const adapter = new AgentRuntimeReaderSummaryModelAdapter({ client, agentProvider: "codex" });
  const route = adapter.route(input, {
    preferredProvider: "agent-runtime", maxInputTokens: 100000,
    maxOutputTokens: 16000, maxEstimatedCostUsd: 5,
  }, { remainingTokens: 160000, remainingCostUsd: 10 });
  const result = await adapter.planDaily(input, route);
  expect(result.plan.topics[0]?.feedItemIds).toEqual([selected[19]!.feedItemId]);
  expect(client.commands).toHaveLength(1);
  expect(client.commands[0]!.purpose).toBe("social_monitor.reader_summary.daily_editorial.plan.v1");
  const payload = JSON.parse(client.commands[0]!.prompt) as {
    sources: readonly { feedItemId: string; nativeCount: number | null }[];
  };
  expect(payload.sources.map(source => source.feedItemId))
    .toEqual(selected.map(source => source.feedItemId));
  expect(payload.sources[0]?.nativeCount).toBe(selected[0]?.nativeCount);
  expect(result.editorRequestSha256).toBe(
    createHash("sha256").update(client.commands[0]!.prompt).digest("hex"));
});

it("runs the daily editor and writer consecutively against the same frozen thirty-source input", async () => {
  const { input, evidence, manifest, snapshots, job } = await dailyDigestFixture();
  const selected = evidence.dailyGenerationInput!.selected;
  const rawPlan = {
    version: "reader_summary.daily_editorial.v1",
    topics: [
      { title: "Later high-impact change", why: "Practical impact outweighs popularity",
        depth: "detailed", feedItemIds: [selected[19]!.feedItemId, selected[26]!.feedItemId] },
      ...selected.slice(0, 9).map((item, index) => ({
        title: `Distinct event ${index + 1}`, why: "Independent engineering value",
        depth: index < 3 ? "detailed" : "brief", feedItemIds: [item.feedItemId],
      })),
    ],
  };
  const plan = validateDailyEditorialPlan(rawPlan, evidence.dailyGenerationInput!);
  const writer = { ...input, dailyEditorialPlan: plan,
    coveragePlan: dailyEditorialCoveragePlan(plan, evidence),
    policy: { ...input.policy, maxStories: plan.topics.length } };
  const client = new CapturingAgentRuntimeClient([
    { status: "completed", structuredOutput: rawPlan, warnings: [] },
    { status: "completed", structuredOutput: dailyProviderDraft(writer), warnings: [] },
  ]);
  const model = new AgentRuntimeReaderSummaryModelAdapter({ client, agentProvider: "codex" });
  const generated = await generateReaderSummaryWithDailyEditor({
    model, input,
    policy: { preferredProvider: "agent-runtime", maxInputTokens: 100000,
      maxOutputTokens: 16000, maxEstimatedCostUsd: 5 },
    budget: { remainingTokens: 160000, remainingCostUsd: 10 },
  });
  expect(client.commands).toHaveLength(2);
  expect(client.commands[0]!.purpose).toBe("social_monitor.reader_summary.daily_editorial.plan.v1");
  expect(client.commands[1]!.purpose).not.toBe(client.commands[0]!.purpose);
  const editorPayload = JSON.parse(client.commands[0]!.prompt) as {
    sources: readonly { feedItemId: string; nativeCount: number | null }[];
  };
  const writerPayload = JSON.parse(client.commands[1]!.prompt) as {
    evidence: readonly { feedItemId: string; citationId: string }[];
    dailyEditorialPlan: typeof plan;
  };
  expect(editorPayload.sources.map(item => item.feedItemId))
    .toEqual(selected.map(item => item.feedItemId));
  expect(editorPayload.sources.map(item => item.nativeCount))
    .toEqual(selected.map(item => item.nativeCount));
  expect(writerPayload.evidence.map(item => item.feedItemId))
    .toEqual(selected.map(item => item.feedItemId));
  expect(writerPayload.evidence[19]?.citationId).toBe("c20");
  expect(writerPayload.dailyEditorialPlan).toEqual(plan);
  expect(client.commands[0]!.prompt).not.toContain("board-only source text");
  expect(client.commands[1]!.prompt).not.toContain("board-only source text");
  expect(generated.editor?.plan).toEqual(plan);
  expect(generated.attempt.dailyGenerationReceipt?.editorialPlanSha256)
    .toBe(canonicalJsonSha256(plan));
  expect(generated.attempt.draft.topStories).toHaveLength(10);
  const publication = buildReaderSummaryDraftWithPromotionContent(evidence, generated.attempt.draft);
  const artifact = buildReaderSummaryModelArtifact({
    snapshot: job.toSnapshot(), readerSummaryId: "two-call-editorial-test-artifact",
    generatedAt: input.requestedAt, modelEvidence: evidence, contextArtifacts: [],
    draft: publication, dailyGenerationReceipt: generated.attempt.dailyGenerationReceipt,
    dailyEditorialPlan: { plan, frozenManifestSha256: evidence.dailyGenerationInput!.manifestSha256,
      editorRequestSha256: generated.editor!.editorRequestSha256,
      editorOutputSha256: generated.editor!.editorOutputSha256 },
  });
  const saved = artifact.toSnapshot();
  expect(saved.content?.narrativeSections).toHaveLength(10);
  expect(saved.content?.sourceMix.reduce((sum, item) => sum + item.itemCount, 0)).toBe(30);
  expect(dailyGenerationPublicationMatches({
    manifest, manifestSha256: evidence.dailyGenerationInput!.manifestSha256,
    periodKey: input.period.periodKey,
    identity: { tenantId: input.tenantId, workspaceId: input.workspaceId, scope: input.scope },
    snapshots, artifact: saved,
  })).toBe(true);
});

it("does not dispatch the writer for a rejected editorial plan", async () => {
  const { input } = await dailyDigestFixture();
  const client = new CapturingAgentRuntimeClient({
    status: "completed", warnings: [],
    structuredOutput: {
      version: "reader_summary.daily_editorial.v1",
      topics: [{ title: "Unbound claim", why: "Unsupported source",
        depth: "detailed", feedItemIds: ["outside-the-frozen-thirty"] }],
    },
  });
  const model = new AgentRuntimeReaderSummaryModelAdapter({ client, agentProvider: "codex" });
  await expect(generateReaderSummaryWithDailyEditor({
    model, input,
    policy: { preferredProvider: "agent-runtime", maxInputTokens: 100000,
      maxOutputTokens: 16000, maxEstimatedCostUsd: 5 },
    budget: { remainingTokens: 160000, remainingCostUsd: 10 },
  })).rejects.toThrow("Daily editorial topic references unknown or duplicate source");
  expect(client.commands).toHaveLength(1);
  expect(client.commands[0]!.purpose).toBe("social_monitor.reader_summary.daily_editorial.plan.v1");
});

it("does not dispatch the writer after an editor exhausts the shared budget", async () => {
  const { input, evidence } = await dailyDigestFixture();
  const selected = evidence.dailyGenerationInput!.selected;
  const plan = {
    version: "reader_summary.daily_editorial.v1",
    topics: [{ title: "Expensive editor", why: "Bound to one source",
      depth: "detailed", feedItemIds: [selected[0]!.feedItemId] }],
  };
  const client = new CapturingAgentRuntimeClient({
    status: "completed", structuredOutput: plan, warnings: [],
    usage: { inputTokens: 160000, outputTokens: 12, totalTokens: 160012,
      estimatedCostUsd: 0 },
  });
  const model = new AgentRuntimeReaderSummaryModelAdapter({ client, agentProvider: "codex" });
  await expect(generateReaderSummaryWithDailyEditor({
    model, input,
    policy: { preferredProvider: "agent-runtime", maxInputTokens: 100000,
      maxOutputTokens: 16000, maxEstimatedCostUsd: 5 },
    budget: { remainingTokens: 160000, remainingCostUsd: 10 },
  })).rejects.toThrow("Daily editorial planning consumed the model budget");
  expect(client.commands).toHaveLength(1);
});

it("fails closed after a valid editor when the writer drops its planned topic", async () => {
  const { input, evidence } = await dailyDigestFixture();
  const selected = evidence.dailyGenerationInput!.selected;
  const rawPlan = {
    version: "reader_summary.daily_editorial.v1",
    topics: [{ title: "Valid editorial topic", why: "Specific source evidence",
      depth: "detailed", feedItemIds: [selected[19]!.feedItemId] }],
  };
  const plan = validateDailyEditorialPlan(rawPlan, evidence.dailyGenerationInput!);
  const writer = { ...input, dailyEditorialPlan: plan,
    coveragePlan: dailyEditorialCoveragePlan(plan, evidence),
    policy: { ...input.policy, maxStories: 1 } };
  const client = new CapturingAgentRuntimeClient([
    { status: "completed", structuredOutput: rawPlan, warnings: [] },
    { status: "completed", structuredOutput: {
      ...dailyProviderDraft(writer), narrativeSections: [],
    }, warnings: [] },
  ]);
  const model = new AgentRuntimeReaderSummaryModelAdapter({ client, agentProvider: "codex" });
  await expect(generateReaderSummaryWithDailyEditor({
    model, input,
    policy: { preferredProvider: "agent-runtime", maxInputTokens: 100000,
      maxOutputTokens: 16000, maxEstimatedCostUsd: 5 },
    budget: { remainingTokens: 160000, remainingCostUsd: 10 },
  })).rejects.toThrow("Daily editorial narrative must cover every planned topic");
  expect(client.commands).toHaveLength(3);
  expect(client.commands[1]!.purpose).not.toBe(client.commands[0]!.purpose);
  expect(client.commands[2]!.metadata?.attempt).toBe("repair");
});

it("repairs an invalid daily editorial writer once without replanning sources", async () => {
  const { input, evidence } = await dailyDigestFixture();
  const selected = evidence.dailyGenerationInput!.selected;
  const rawPlan = {
    version: "reader_summary.daily_editorial.v1",
    topics: [{ title: "High impact late source", why: "The verified original source",
      depth: "detailed", feedItemIds: [selected[19]!.feedItemId] }],
  };
  const plan = validateDailyEditorialPlan(rawPlan, evidence.dailyGenerationInput!);
  const writer = { ...input, dailyEditorialPlan: plan,
    coveragePlan: dailyEditorialCoveragePlan(plan, evidence),
    policy: { ...input.policy, maxStories: 1 } };
  const client = new CapturingAgentRuntimeClient([
    { status: "completed", structuredOutput: rawPlan, warnings: [] },
    { status: "completed", structuredOutput: {
      ...dailyProviderDraft(writer), narrativeSections: [],
    }, warnings: [] },
    { status: "completed", structuredOutput: dailyProviderDraft(writer), warnings: [] },
  ]);
  const model = new AgentRuntimeReaderSummaryModelAdapter({ client, agentProvider: "codex" });
  const generated = await generateReaderSummaryWithDailyEditor({
    model, input,
    policy: { preferredProvider: "agent-runtime", maxInputTokens: 100000,
      maxOutputTokens: 16000, maxEstimatedCostUsd: 5 },
    budget: { remainingTokens: 160000, remainingCostUsd: 10 },
  });
  expect(client.commands).toHaveLength(3);
  expect(client.commands[1]!.metadata?.attempt).toBe("primary");
  expect(client.commands[2]!.metadata?.attempt).toBe("repair");
  expect(client.commands[2]!.systemPrompt).toContain(
    "Return exactly one secondary_signal for every coveragePlan.secondary entry");
  expect(client.commands[2]!.prompt).toBe(client.commands[1]!.prompt);
  expect(client.commands[2]!.requestId).not.toBe(client.commands[1]!.requestId);
  expect(generated.editor?.plan).toEqual(plan);
  expect(generated.attempt.draft.topStories).toHaveLength(1);
  expect(generated.attempt.dailyGenerationReceipt?.editorialPlanSha256)
    .toBe(canonicalJsonSha256(plan));
});

it.each([
  { limit: "tokens", editorCost: 0, writerUsage: {
    inputTokens: 95000, outputTokens: 10000, totalTokens: 105000, estimatedCostUsd: 0 },
    budget: { remainingTokens: 100000, remainingCostUsd: 10 } },
  { limit: "cost", editorCost: 1, writerUsage: {
    inputTokens: 100, outputTokens: 200, totalTokens: 300, estimatedCostUsd: 4.5 },
    budget: { remainingTokens: 100000, remainingCostUsd: 5 } },
])("rejects actual daily writer $limit usage above the shared post-editor budget", async ({ editorCost, writerUsage, budget }) => {
  const { input, evidence } = await dailyDigestFixture();
  const rawPlan = {
    version: "reader_summary.daily_editorial.v1",
    topics: [{ title: "Budgeted development", why: "Source-grounded impact",
      depth: "detailed", feedItemIds: [evidence.dailyGenerationInput!.selected[19]!.feedItemId] }],
  };
  const plan = validateDailyEditorialPlan(rawPlan, evidence.dailyGenerationInput!);
  const writer = { ...input, dailyEditorialPlan: plan,
    coveragePlan: dailyEditorialCoveragePlan(plan, evidence),
    policy: { ...input.policy, maxStories: 1 } };
  const client = new CapturingAgentRuntimeClient([
    { status: "completed", structuredOutput: rawPlan, warnings: [],
      usage: { inputTokens: 100, outputTokens: 30, totalTokens: 130,
        estimatedCostUsd: editorCost } },
    { status: "completed", structuredOutput: dailyProviderDraft(writer),
      warnings: [], usage: writerUsage },
  ]);
  const model = new AgentRuntimeReaderSummaryModelAdapter({ client, agentProvider: "codex" });
  await expect(generateReaderSummaryWithDailyEditor({
    model, input,
    policy: { preferredProvider: "agent-runtime", maxInputTokens: 100000,
      maxOutputTokens: 16000, maxEstimatedCostUsd: 5 },
    budget,
  })).rejects.toThrow("Daily editorial writer exceeded the shared model budget");
  expect(client.commands).toHaveLength(2);
});
