import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { activeReaderSummaryPurposes as purposes } from "@social-monitor/summary/adapters/model/active-reader-summary-generation-profile";
import type { AgentRuntimeTaskCommand, AgentRuntimeTaskResult } from "@social-monitor/summary/ports";
import type { BuildReaderSummaryTopicMapCommand } from "@social-monitor/summary/features/build-reader-summary-topic-map/build-reader-summary-topic-map.command";
import { evaluateReaderSummaryTopicMapStructure } from "@social-monitor/summary/domain";
import { buildRefreshModelWiring, guardedRefreshRuntime } from "./reader-summary-new-input-refresh-model";
import { completedRefreshModelRequest, refreshModelCommand } from "./reader-summary-new-input-refresh-model.spec-support";
import { refreshManifest, refreshNow } from "./reader-summary-new-input-refresh.spec-support";

describe("refresh composed model attempt contract", () => {
  it("preserves the reviewer's two known low-coverage attempts, rejects the map and never invokes a third", async () => {
    const test = wiring(async (command) => completedRefreshModelRequest(command, topicOutput(command, false)));
    await test.runtime.runTask(refreshModelCommand());
    const result = await test.model.topicMap.execute(topicCommand(false));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Low coverage must remain unpublishable");
    expect(result.error.message).toContain("grouped coverage is below 0.5");
    const labels = test.commands.filter((command) => command.purpose === purposes.topicLabel);
    expect(labels.map((command) => command.metadata?.attemptNumber)).toEqual(["1", "2"]);
    expect(labels.map((command) => command.metadata?.totalAttempts)).toEqual(["2", "2"]);
    expect(labels[0]!.requestId).not.toBe(labels[1]!.requestId);
    expect(JSON.parse(labels[0]!.prompt).retryFeedback).toBeNull();
    expect(JSON.parse(labels[1]!.prompt).retryFeedback).toMatchObject({
      reason: "grouped_coverage_below_minimum", previousGroupedCoverage: 0, minimumGroupedCoverage: 0.5,
    });
    expect(test.commands).toHaveLength(3); // One primary plus two topic labels.
    expect(test.events.filter((event) => event.status === "completed")).toHaveLength(3);
    expect(() => test.runtime.assertUsable()).not.toThrow();
    await expect(test.runtime.runTask({ ...refreshModelCommand(), requestId: "second-primary" })).rejects.toThrow(/budget/);
    expect(test.commands).toHaveLength(3);
  });

  it.each([false, true])("keeps a grounded quality repair available (first attempt good: %s)", async (firstGood) => {
    const test = wiring(async (command) => completedRefreshModelRequest(command,
      topicOutput(command, firstGood || command.metadata?.attemptNumber === "2")));
    const result = await test.model.topicMap.execute(topicCommand(true));
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    const quality = evaluateReaderSummaryTopicMapStructure(result.value);
    expect(quality.passed).toBe(true);
    expect(quality.metrics.groupedCoverage).toBeGreaterThanOrEqual(0.5);
    const attempts = firstGood ? ["1"] : ["1", "2"];
    for (const purpose of [purposes.topicLabel, purposes.topicRelations]) {
      expect(test.commands.filter((command) => command.purpose === purpose)
        .map((command) => command.metadata?.attemptNumber)).toEqual(attempts);
    }
    expect(test.commands).toHaveLength(attempts.length * 2);
    expect(test.sink.record).toHaveBeenCalledTimes(attempts.length * 2);
    expect(() => test.runtime.assertUsable()).not.toThrow();
  });

  const uncertainties = ["throw", "failed", "waiting_for_input", "missing-attestation", "missing-usage", "wrong-request"] as const;
  it.each(uncertainties)("permits no follow-up after uncertain topic labeling: %s", async (kind) => {
    const test = wiring((command) => uncertain(command, kind));
    const result = await test.model.topicMap.execute(topicCommand(false));
    expect(result.ok).toBe(false);
    expect(test.commands.map((command) => command.metadata?.attemptNumber)).toEqual(["1"]);
    await expect(test.runtime.runTask(refreshModelCommand())).rejects.toThrow(/budget/);
    expect(() => test.runtime.assertUsable()).toThrow(/reconciliation/);
    expect(test.sink.record).not.toHaveBeenCalled();
    expect(test.events.filter((event) => event.status === "completed")).toHaveLength(0);
  });

  it.each(uncertainties)("a caught relation-verifier uncertainty cannot start the quality repair: %s", async (kind) => {
    const test = wiring((command) => command.purpose === purposes.topicRelations
      ? uncertain(command, kind) : completedRefreshModelRequest(command, topicOutput(command, false)));
    const result = await test.model.topicMap.execute(topicCommand(true));
    expect(result.ok).toBe(false);
    expect(test.commands.map((command) => [command.purpose, command.metadata?.attemptNumber])).toEqual([
      [purposes.topicLabel, "1"], [purposes.topicRelations, "1"],
    ]);
    await expect(test.runtime.runTask(refreshModelCommand())).rejects.toThrow(/budget/);
    expect(() => test.runtime.assertUsable()).toThrow(/reconciliation/);
    expect(test.sink.record).toHaveBeenCalledTimes(1);
    expect(test.events.filter((event) => event.status === "completed")).toHaveLength(1);
  });
});

function wiring(respond: (command: AgentRuntimeTaskCommand) => Promise<AgentRuntimeTaskResult>) {
  const commands: AgentRuntimeTaskCommand[] = [];
  const events: { status: string }[] = [];
  const runtime = guardedRefreshRuntime({ manifest: refreshManifest(), delegate: {
    runTask: async (command) => { commands.push(command); return respond(command); }, checkHealth: jest.fn(),
  }, assertLocal: () => undefined, assertCurrent: async () => undefined,
  record: (event) => events.push(event as { status: string }) });
  const sink = { record: jest.fn(() => runtime.assertUsable()) };
  return { runtime, commands, events, sink, model: buildRefreshModelWiring({}, runtime, sink) };
}

async function uncertain(command: AgentRuntimeTaskCommand, kind: string): Promise<AgentRuntimeTaskResult> {
  if (kind === "throw") throw new Error("Synthetic uncertain transport");
  const result = await completedRefreshModelRequest(kind === "wrong-request"
    ? { ...command, prompt: command.prompt + " alternate" } : command, topicOutput(command, false));
  switch (kind) {
    case "failed": return { status: "failed", warnings: [] };
    case "waiting_for_input": return { status: "waiting_for_input", warnings: [] };
    case "missing-attestation": return { ...result, executionAttestation: undefined };
    case "missing-usage": return { ...result, usage: undefined };
    default: return result;
  }
}

function topicOutput(command: AgentRuntimeTaskCommand, good: boolean): Record<string, unknown> {
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

function topicCommand(related: boolean): BuildReaderSummaryTopicMapCommand {
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
