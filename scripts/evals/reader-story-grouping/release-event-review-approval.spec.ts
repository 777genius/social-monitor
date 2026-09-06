import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { canonicalJsonSha256 } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import { StoryClusteringService } from "@social-monitor/summary/domain/services/story-clustering.service";
import { buildStoryRelationCandidates, STORY_RELATION_APPROVAL_CONFIDENCE_MIN,
  type StoryRelationCandidate } from "@social-monitor/summary/domain/services/story-relation-candidates";
import { reconcileStoryRelationDecisions } from "@social-monitor/summary/domain/services/story-relation-decision-trace";
import { releaseIdentityReviewCases, releaseIdentityResidualCases } from "@social-monitor/summary/domain/services/story-release-event-identity-review.spec-support";
import { releaseEvidence, releaseIdentityControls } from "@social-monitor/summary/domain/services/story-release-event-identity.spec-support";
import { AgentRuntimeReaderSummaryStoryRelationVerifier } from "@social-monitor/summary/adapters/model/agent-runtime-reader-summary-story-relation-verifier.adapter";
import { withTestExecutionAttestation } from "@social-monitor/summary/adapters/model/reader-summary-execution-attestation.spec-support";
import type { AgentRuntimeTaskCommand } from "@social-monitor/summary/ports";
import { canonicalRequestFor } from "./requests";

const now = new Date("2026-09-01T14:00:00Z");
const identity = { tenantId: tenantId("fixture-tenant"), workspaceId: workspaceId("fixture-workspace"),
  scope: { type: "workspace" as const } };
const cases = [
  ...releaseIdentityReviewCases.map((c) => ({ ...c, mayMerge: false })),
  ...releaseIdentityResidualCases,
  ...releaseIdentityControls.map((c) => ({ name: c.name, mayMerge: c.sameStory, inputs: [
    releaseEvidence(c.leftText), releaseEvidence(c.rightText, "right", "x-twitter"),
  ] })),
];
const controls = [
  { name: "true at one", sameStory: true, confidenceScore: 1, accepted: true, approved: true },
  { name: "true at boundary", sameStory: true, confidenceScore: 0.92, accepted: true, approved: true },
  { name: "below boundary", sameStory: true, confidenceScore: 0.919999, accepted: true, approved: false },
  { name: "false", sameStory: false, confidenceScore: 1, accepted: true, approved: false },
  { name: "missing", sameStory: true, confidenceScore: 1, accepted: false, approved: false },
  { name: "invalid confidence", sameStory: true, confidenceScore: 1.1, accepted: false, approved: false },
  { name: "invalid boolean", sameStory: "true", confidenceScore: 1, accepted: false, approved: false },
];

describe.each(cases)("offline adapter to final guard: $name", ({ inputs, mayMerge }) => {
  it.each(controls)("$name", async (control) => {
    const items = inputs.map((input, i) => ({
      ...releaseEvidence("", i ? "right" : "left", i ? "x-twitter" : "reddit"), ...input,
    }));
    const clusterer = new StoryClusteringService({ now: () => now });
    const initial = clusterer.cluster({ identity, items, limit: 10 });
    expect(buildStoryRelationCandidates({ selection: initial, evidence: items })).toHaveLength(mayMerge ? 1 : 0);
    // Deliberately inject a pair even when retrieval refuses it. The production
    // normalizer/reconciler must not make an approval sufficient for membership.
    const candidate: StoryRelationCandidate = {
      leftFeedItemId: items[0]!.feedItemId, rightFeedItemId: items[1]!.feedItemId,
      leftClusterId: initial.clusters[0]!.id, rightClusterId: initial.clusters[1]!.id,
      sharedTopicTokens: [], sharedAnchorTokens: [], sharedEventTokens: [],
      sharedSpecificProductTokens: [], topicSimilarity: 0,
    };
    const runTask = jest.fn(async (command: AgentRuntimeTaskCommand) => {
      expect(command.controls).toMatchObject({ model: "gpt-5.6-sol", reasoningEffort: "high", maxOutputTokens: 6000 });
      expect(command.purpose).toBe("social_monitor.reader_summary.verify_story_relations.v2");
      const prompt = JSON.parse(command.prompt);
      expect(prompt.pairs[0].left.sourceText).toBe(items[0]!.sourceText);
      expect(prompt.pairs[0].right.sourceText).toBe(items[1]!.sourceText);
      const result = withTestExecutionAttestation(command, {
        status: "completed", warnings: [], structuredOutput: {
          decisions: control.name === "missing" ? [] : [{
            leftFeedItemId: candidate.leftFeedItemId, rightFeedItemId: candidate.rightFeedItemId,
            rationale: "Deterministic TEST wire annotation; not model evidence.",
            sameStory: control.sameStory, confidenceScore: control.confidenceScore,
          }],
        },
      });
      return { ...result, executionAttestation: { ...result.executionAttestation!,
        runtimePackageVersion: "0.0.0-fixture",
        canonicalRequestSha256: canonicalJsonSha256(canonicalRequestFor(command)),
      } };
    });
    const verifier = new AgentRuntimeReaderSummaryStoryRelationVerifier({ client: {
      runTask, checkHealth: async () => { throw new Error("Offline fixture; no health/provider call permitted"); },
    } });
    const candidates = [candidate];
    const decisions = await verifier.verify({ ...identity,
      period: { cadence: "custom", timezone: "UTC", periodKey: "fixture-release-review",
        startedAt: new Date("2026-09-01T00:00:00Z"), endedAt: new Date("2026-09-02T00:00:00Z") },
      requestedAt: now, evidence: items, clusters: initial.clusters, candidates,
    }).catch((error: unknown) => {
      expect(["invalid confidence", "invalid boolean"]).toContain(control.name);
      expect(error).toMatchObject({ failure: { kind: "invalid_schema", retryable: false } });
      return [];
    });
    expect(runTask).toHaveBeenCalledTimes(1);
    const batch = reconcileStoryRelationDecisions({ candidates, decisions,
      rankingPolicyVersion: initial.rankingPolicyVersion, approvalThreshold: STORY_RELATION_APPROVAL_CONFIDENCE_MIN,
    });
    expect(batch.responseAccepted).toBe(control.accepted);
    expect(batch.approvedPairs.size).toBe(control.approved ? 1 : 0);
    expect(clusterer.cluster({ identity, items, limit: 10,
      verifiedStoryRelationPairs: batch.approvedPairs }).clusters).toHaveLength(mayMerge && control.approved ? 1 : 2);
  });
});
