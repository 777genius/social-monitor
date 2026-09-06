import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { STORY_RANKING_POLICY_V1 as policy } from "../policies/story-ranking-policy";
import { StoryClusteringService } from "./story-clustering.service";
import { belongsToVerifiedStoryCluster, isDeterministicCrossProviderStoryMatch,
  isVerifiedStoryRelationGuardEligible, verifiedStoryRelationPairKey } from "./story-cluster-membership";
import { buildStoryRelationCandidates } from "./story-relation-candidates";
import { samePrimaryReleaseEvent, storyReleaseEventIdentity } from "./story-release-event-identity";
import { releaseEvidence } from "./story-release-event-identity.spec-support";
import { releaseIdentityReviewCases } from "./story-release-event-identity-review.spec-support";

const identity = { tenantId: tenantId("fixture-tenant"), workspaceId: workspaceId("fixture-workspace"),
  scope: { type: "workspace" as const } };
const clusterer = new StoryClusteringService({ now: () => new Date("2026-09-01T14:00:00Z") });

describe("independently reproduced release identity defects", () => {
  it.each(releaseIdentityReviewCases)("$finding: $name rejects retrieval and forced membership", ({ inputs }) => {
    const [left, right] = inputs.map((input, i) => ({
      ...releaseEvidence("", i ? "right" : "left", i ? "x-twitter" : "reddit"), ...input,
    }));
    const items = [left!, right!];
    const approved = new Set([verifiedStoryRelationPairKey(left!.feedItemId, right!.feedItemId)]);
    expect(isDeterministicCrossProviderStoryMatch(left!, right!, policy)).toBe(false);
    expect(samePrimaryReleaseEvent(left!, right!)).toBe(false);
    for (const [a, b] of [[left!, right!], [right!, left!]]) {
      expect(isVerifiedStoryRelationGuardEligible(a!, b!, policy)).toBe(false);
      expect(belongsToVerifiedStoryCluster(a!, [b!], policy, approved)).toBe(false);
      expect(belongsToVerifiedStoryCluster(a!, [b!], policy, new Set(), approved)).toBe(false);
    }
    const selection = clusterer.cluster({ identity, items, limit: 10 });
    expect(buildStoryRelationCandidates({ selection, evidence: items })).toHaveLength(0);
    expect(clusterer.cluster({ identity, items, limit: 10,
      verifiedStoryRelationPairs: approved }).clusters).toHaveLength(2);
  });

  it("keeps every comma-coordinated target and its own version", () => {
    const { inputs } = releaseIdentityReviewCases.find((c) => c.finding === "R3")!;
    expect(storyReleaseEventIdentity({ ...releaseEvidence(""), ...inputs[0] })?.targets)
      .toEqual(["vela@7.3", "lyra@7.3", "atlas@7.3"]);
    expect(storyReleaseEventIdentity({ ...releaseEvidence(""), ...inputs[1] })?.targets)
      .toEqual(["vela@7.3", "lyra@7.4", "atlas@7.4"]);
  });

  it.each(releaseIdentityReviewCases.filter((c) => c.finding === "R4"))(
    "retains target-bound evidence: $name", ({ name, inputs }) => {
      const parsed = storyReleaseEventIdentity({ ...releaseEvidence(""), ...inputs[1] });
      expect(parsed).toMatchObject(name.startsWith("different_date")
        ? { eventDate: "2026-08-01", stage: "release" }
        : { eventDate: "2026-09-01", stage: "preview" });
    },
  );
});
