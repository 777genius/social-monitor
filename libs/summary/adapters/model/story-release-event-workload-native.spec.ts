import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { canonicalJsonSha256 } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import { StoryClusteringService } from "@social-monitor/summary/domain/services/story-clustering.service";
import { releaseWorkloadCases } from "@social-monitor/summary/domain/services/story-release-event-workload.spec-support";
import { verifiedReaderSummaryStoryRelations } from "@social-monitor/summary/adapters/evidence/relevance-reader-summary-story-relation-decisions";
import { NOOP_STORY_RANKING_METRICS, type AgentRuntimeTaskCommand, type AgentRuntimeTaskResult } from "@social-monitor/summary/ports";
import { AgentRuntimeReaderSummaryStoryRelationVerifier } from "./agent-runtime-reader-summary-story-relation-verifier.adapter";
import { withTestExecutionAttestation } from "./reader-summary-execution-attestation.spec-support";
import { canonicalRequestFor } from "../../../../scripts/evals/reader-story-grouping/requests";

const now = new Date("2026-09-01T14:00:00Z");
const identity = { tenantId: tenantId("fixture-tenant"), workspaceId: workspaceId("fixture-workspace"),
  scope: { type: "workspace" as const } };
const period = { cadence: "custom" as const, timezone: "UTC", periodKey: "fixture-r10-workload",
  startedAt: new Date("2026-09-01T00:00:00Z"), endedAt: new Date("2026-09-02T00:00:00Z") };
const controls = ["true1", "true092", "false", "below", "refusal", "waiting", "no-output", "transport",
  "missing", "duplicate", "unknown-pair", "invalid-boolean", "invalid-confidence", "no-attestation",
  "wrong-model", "wrong-output-digest"];

/** Actual selector/adapter/reconciliation/membership; only the client is fake. */
describe.each(releaseWorkloadCases)("native R10: $name", ({ inputs, mayMerge }) => {
  it.each(controls)("%s", async (control) => {
    const items = inputs;
    const clusterer = new StoryClusteringService({ now: () => now });
    const initial = clusterer.cluster({ identity, items, limit: 10 });
    expect(initial.clusters).toHaveLength(2);
    const runTask = jest.fn(async (command: AgentRuntimeTaskCommand): Promise<AgentRuntimeTaskResult> => {
      const pairs = JSON.parse(command.prompt).pairs as { leftFeedItemId: string; rightFeedItemId: string }[];
      expect(pairs).toHaveLength(1);
      if (control === "transport") throw new Error("Offline fixture transport failure");
      if (control === "waiting") return { status: "waiting_for_input", warnings: [] };
      if (control === "no-output") return { status: "completed", warnings: [] };
      if (control === "refusal") return { status: "failed", warnings: [], failure: {
        code: "provider_refusal", safeMessage: "Offline fixture refusal", retryable: false,
        reconnectRequired: false, causeCategory: "refusal", details: {},
      } };
      const decisions = pairs.map((pair) => ({
        leftFeedItemId: pair.leftFeedItemId,
        rightFeedItemId: control === "unknown-pair" ? "unknown" : pair.rightFeedItemId,
        rationale: "Deterministic TEST wire annotation; not model evidence.",
        sameStory: control === "invalid-boolean" ? "true" : control !== "false",
        confidenceScore: control === "invalid-confidence" ? 1.1 : control === "below" ? 0.919999 : control === "true092" ? 0.92 : 1,
      }));
      if (control === "missing") decisions.pop();
      if (control === "duplicate") decisions.push(decisions[0]!);
      const raw = withTestExecutionAttestation(command, { status: "completed", warnings: [], structuredOutput: { decisions } });
      if (control === "no-attestation") return { status: "completed", warnings: [], structuredOutput: { decisions } };
      return { ...raw, executionAttestation: { ...raw.executionAttestation!,
        runtimePackageVersion: "0.0.0-fixture",
        canonicalRequestSha256: canonicalJsonSha256(canonicalRequestFor(command)),
        ...(control === "wrong-model" ? { model: "fixture-wrong-model" } : {}),
        ...(control === "wrong-output-digest" ? { selectedOutputSha256: "0".repeat(64) } : {}),
      } };
    });
    const verifier = new AgentRuntimeReaderSummaryStoryRelationVerifier({ client: {
      runTask, checkHealth: async () => { throw new Error("Offline fixture; health calls forbidden"); },
    } });
    const result = await verifiedReaderSummaryStoryRelations({
      query: { ...identity, period, maxItems: 10, observedThrough: now },
      evidence: items, deterministicSelection: initial, requestedAt: now, verifier,
      metrics: NOOP_STORY_RANKING_METRICS,
    });
    expect(result.candidates).toHaveLength(mayMerge ? 1 : 0);
    expect(runTask).toHaveBeenCalledTimes(mayMerge ? 1 : 0);
    const approved = mayMerge && (control === "true1" || control === "true092");
    expect(result.pairs.size).toBe(approved ? 1 : 0);
    expect(clusterer.cluster({ identity, items, limit: 10, verifiedStoryRelationPairs: result.pairs,
      verifiedStrictTitleRelationPairs: result.strictTitlePairs }).clusters).toHaveLength(approved ? 1 : 2);
  });
});
