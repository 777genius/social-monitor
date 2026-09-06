import { buildReaderSummaryCoveragePlan } from "@social-monitor/summary/domain";
import { redditPromotionFacts } from "@social-monitor/summary/adapters/model/reader-summary-model-promotion.spec-support";
import type { PrismaReaderSummaryClient } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-client";
import { refreshPublicationGuard } from "./reader-summary-new-input-refresh-execution";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { activeReaderSummaryPurposes as purposes } from "@social-monitor/summary/adapters/model/active-reader-summary-generation-profile";
import type { AgentRuntimeTaskCommand, AgentRuntimeTaskResult, ReaderSummaryModelInput, ReaderSummaryModelPort, ReaderSummaryPublicationCommand } from "@social-monitor/summary/ports";
import type { BuildReaderSummaryTopicMapCommand } from "@social-monitor/summary/features/build-reader-summary-topic-map/build-reader-summary-topic-map.command";
import { buildRefreshModelWiring, guardedRefreshRuntime } from "./reader-summary-new-input-refresh-model";
import { refreshManifest, refreshNow } from "./reader-summary-new-input-refresh.spec-support";

export function wiring(respond: (command: AgentRuntimeTaskCommand) => Promise<AgentRuntimeTaskResult>) {
  const commands: AgentRuntimeTaskCommand[] = [];
  const events: { status: string; phase?: string; taskRole?: string }[] = [];
  const runtime = guardedRefreshRuntime({ manifest: refreshManifest(), delegate: {
    runTask: async (command) => { commands.push(command); return respond(command); }, checkHealth: jest.fn(),
  }, assertLocal: () => undefined, assertCurrent: async () => undefined,
  record: (event) => events.push(event as { status: string }) });
  const sink = { record: jest.fn(() => runtime.assertUsable()) };
  return { runtime, commands, events, sink, model: buildRefreshModelWiring({}, runtime, sink) };
}

export function topicOutput(command: AgentRuntimeTaskCommand, good: boolean): Record<string, unknown> {
  if (command.purpose === purposes.generate) return { synthetic: true };
  if (command.purpose === purposes.topicRelations) {
    const payload = JSON.parse(command.prompt) as { pairs: { sourceNodeId: string; targetNodeId: string }[] };
    return { decisions: payload.pairs.map((pair) => ({ sourceNodeId: pair.sourceNodeId, targetNodeId: pair.targetNodeId,
      sameTopic: false, confidenceScore: 0.95, rationale: "Distinct synthetic announcements" })) };
  }
  const payload = JSON.parse(command.prompt) as { nodes: { nodeId: string; fallbackLabel: string }[] };
  return { nodeLabels: payload.nodes.map((node, index) => ({ nodeId: node.nodeId, topicId: index < 2 && node.fallbackLabel.toLowerCase().includes("runtime") ? "topic:shared-proposal" : `topic:synthetic-${index}`,
    subject: node.fallbackLabel, parentSubject: good ? "Runtime" : undefined, claimType: "other",
    confidenceScore: good ? 0.95 : 0.4, keywords: good ? ["Runtime"] : [],
    groupId: good ? "group:runtime" : "group:ungrouped",
  })), groups: good ? [{ id: "group:runtime", label: "Runtime", semanticAnchors: ["Runtime"],
    nodeIds: payload.nodes.map((node) => node.nodeId), confidenceScore: 0.95 }] : [], warnings: [] };
}

export function topicCommand(related: boolean): BuildReaderSummaryTopicMapCommand {
  const m = refreshManifest();
  const names = ["Quartz", "Orchid", "Nimbus", "Cobalt"];
  const selectedEvidence = names.map((name, index) => ({
    feedItemId: `feed-${index}`, sourceItemId: `source-${index}`, sourceBindingId: `binding-${index}`,
    interestId: `interest-${index}`, providerKey: "rss", canonicalUrl: `https://example.test/${index}`,
    title: `${name}${related ? " runtime" : ""}`, bodyPreview: `${name}${related ? " runtime" : ""}`,
    publishedAt: refreshNow, observedAt: refreshNow, score: 0.9, whyImportant: ["Synthetic evidence"],
    contentQuality: { qualityScore: 0.9, interestRelevanceScore: 0.9, engagementIntegrityScore: 0.9,
      eligibleForSummary: true, eligibleForTopRead: true, needsLlmReview: false, decision: "keep",
      flags: [], reason: "Synthetic eligible evidence" },
  }));
  return { tenantId: tenantId(m.tenantId), workspaceId: workspaceId(m.workspaceId), scope: { type: "workspace" },
    period: { cadence: "daily", startedAt: new Date(m.startedAt), endedAt: new Date(m.endedAt), timezone: "UTC", periodKey: m.date },
    requestedAt: refreshNow, selectedEvidence, topStories: [],
    clusters: selectedEvidence.map((item, index) => ({ id: `story:${index}`, storyKey: `synthetic-${index}`,
      representativeFeedItemId: item.feedItemId, duplicateFeedItemIds: [], interestIds: [item.interestId], providerKeys: [item.providerKey],
      score: item.score, observedAtRange: { startedAt: refreshNow, endedAt: refreshNow }, whyImportant: item.whyImportant })),
    citationMap: selectedEvidence.map((item, index) => ({ citationId: `c${index}`, feedItemId: item.feedItemId,
      sourceItemId: item.sourceItemId, providerKey: item.providerKey, field: "title", canonicalUrl: item.canonicalUrl })),
  };
}

export function primaryInput(): ReaderSummaryModelInput {
  const command = topicCommand(true);
  const selectedEvidence = [{ ...command.selectedEvidence[0]!, providerKey: "reddit",
    promotionFacts: redditPromotionFacts(command.selectedEvidence[0]!.canonicalUrl!, refreshNow) }];
  const clusters = [{ ...command.clusters[0]!, providerKeys: ["reddit"] }];
  const evidence = { selectedEvidence, clusters, rankingPolicyVersion: "story_ranking_v1", sourceWindow: {
    windowId: "synthetic-refresh", startedAt: command.period.startedAt, endedAt: command.period.endedAt,
    periodStartedAt: command.period.startedAt, periodEndedAt: command.period.endedAt,
    ingestionCutoff: new Date(refreshManifest().observedThrough),
    selectedFeedItemIds: selectedEvidence.map((item) => item.feedItemId), storyClusterIds: clusters.map((item) => item.id),
  } };
  return { tenantId: command.tenantId, workspaceId: command.workspaceId, scope: command.scope,
    period: command.period, requestedAt: command.requestedAt, evidence,
    coveragePlan: buildReaderSummaryCoveragePlan(evidence), contextArtifacts: [],
    policy: { language: "auto", format: "executive_brief", tone: "analytical", maxStories: 10,
      includeRisks: true, includeInterestHighlights: true, includeRepeatedSignals: true,
      dedupeStrategy: "canonical_url_then_title", rulesVersion: "reader_summary.rules.test.v1" },
  };
}

export function primaryOutput(): Record<string, unknown> {
  return { headline: "Quartz runtime", executiveSummary: "Quartz runtime introduces an isolated synthetic change.",
    narrativeSections: [{ kind: "lead", title: "Quartz runtime", text: "Quartz runtime introduces an isolated synthetic change.",
      citationIds: ["c1"], storyClusterId: "story:0" }],
    topStories: [{ storyClusterId: "story:0", title: "Quartz runtime", summary: "Quartz runtime introduces an isolated synthetic change.",
      interestIds: ["interest-0"], providerKeys: ["reddit"], citationIds: ["c1"] }],
    interestHighlights: [], repeatedSignals: [], risksAndUnknowns: [], qualityFlags: ["limited_sources"],
    confidence: { level: "medium", score: 0.7, rationale: "One synthetic item" }, noSignalReason: null };
}

export function primaryRoute(model: ReaderSummaryModelPort) {
  return model.route(primaryInput(), { preferredProvider: "agent-runtime", maxInputTokens: 24_000,
    maxOutputTokens: 16_000, maxEstimatedCostUsd: 1 }, { remainingTokens: 40_000, remainingCostUsd: 1 });
}

export function publicationProbe(runtime: { assertUsable(): void }) {
  const assertProtected = jest.fn(async () => undefined), assertCurrent = jest.fn(async () => undefined);
  const guard = refreshPublicationGuard({ manifest: refreshManifest(), jobId: "synthetic-job",
    assertLocal: () => runtime.assertUsable(), assertProtected, assertCurrent });
  const command = { finalJob: { toSnapshot: () => ({ id: "synthetic-job" }) },
    artifact: { toSnapshot: () => ({ sourceWindow: { ingestionCutoff: new Date(refreshManifest().observedThrough) } }) },
  } as unknown as ReaderSummaryPublicationCommand;
  const publish = jest.fn();
  return { assertProtected, assertCurrent, publish, attempt: async () => {
    await guard({} as PrismaReaderSummaryClient, command);
    publish();
  } };
}
