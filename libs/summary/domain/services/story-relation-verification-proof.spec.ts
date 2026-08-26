import type { StoryRelationCandidate } from "./story-relation-candidates";
import {
  storyRelationExecutionRequestId,
  type StoryRelationProofSelectionContext,
} from "./story-relation-verification-proof";

describe("story relation execution request identity", () => {
  it("does not collide when delimiter-looking data moves between fields", () => {
    expect(requestId({ tenantId: "tenant:workspace", workspaceId: "scope" }))
      .not.toBe(requestId({ tenantId: "tenant", workspaceId: "workspace:scope" }));
  });

  it("retains the full digest when long scopes only differ after 240 bytes", () => {
    const prefix = "scope-".repeat(60);
    expect(requestId({ scopeKey: `${prefix}left` }))
      .not.toBe(requestId({ scopeKey: `${prefix}right` }));
    expect(requestId({ scopeKey: `${prefix}left` }))
      .toMatch(/^reader-summary-story-relations:v2:[0-9a-f]{64}$/u);
  });

  it("binds exact ordered candidate pairs and shortlist ordering", () => {
    const first = candidate("left", "right");
    const second = candidate("third", "fourth");
    expect(requestId({ candidates: [first] }))
      .not.toBe(requestId({ candidates: [candidate("right", "left")] }));
    expect(requestId({ candidates: [first, second] }))
      .not.toBe(requestId({ candidates: [second, first] }));
  });

  it("does not collapse canonically equivalent Unicode spellings", () => {
    expect(requestId({ scopeKey: "caf\u00e9" }))
      .not.toBe(requestId({ scopeKey: "cafe\u0301" }));
  });
});

const selection: StoryRelationProofSelectionContext = {
  rankingPolicyVersion: "story-ranking.v1",
  sourceWindow: {
    windowId: "window",
    startedAt: new Date("2026-08-20T00:00:00.000Z"),
    endedAt: new Date("2026-08-21T00:00:00.000Z"),
    selectedFeedItemIds: ["left", "right"],
    storyClusterIds: ["cluster:left", "cluster:right"],
  },
};

const requestId = (overrides: Partial<{
  tenantId: string;
  workspaceId: string;
  scopeKey: string;
  candidates: readonly StoryRelationCandidate[];
}>): string => storyRelationExecutionRequestId({
  tenantId: overrides.tenantId ?? "tenant",
  workspaceId: overrides.workspaceId ?? "workspace",
  scopeKey: overrides.scopeKey ?? "scope",
  requestedAt: new Date("2026-08-21T01:02:03.004Z"),
  verificationLane: "guarded_recall_primary",
  selection,
  candidates: overrides.candidates ?? [candidate("left", "right")],
});

const candidate = (
  leftFeedItemId: string,
  rightFeedItemId: string,
): StoryRelationCandidate => ({
  leftFeedItemId,
  rightFeedItemId,
  leftClusterId: `cluster:${leftFeedItemId}`,
  rightClusterId: `cluster:${rightFeedItemId}`,
  sharedTopicTokens: ["runtime"],
  sharedAnchorTokens: ["agent"],
  sharedEventTokens: ["release"],
  sharedSpecificProductTokens: ["agent"],
  topicSimilarity: 1,
});
