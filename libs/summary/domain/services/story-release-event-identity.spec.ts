import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { STORY_RANKING_POLICY_V1 as policy } from "../policies/story-ranking-policy";
import { StoryClusteringService } from "./story-clustering.service";
import { samePrimaryReleaseEvent, storyReleaseEventIdentity } from "./story-release-event-identity";
import { belongsToVerifiedStoryCluster, isDeterministicCrossProviderStoryMatch,
  isVerifiedStoryRelationGuardEligible, verifiedStoryRelationPairKey } from "./story-cluster-membership";
import { buildStoryRelationCandidates } from "./story-relation-candidates";
import { strictStoryRelationTitleEvidence } from "./story-relation-title-evidence";
import { approvedStoryRelationPairs } from "./story-relation-decision-trace";
import { releaseEvidence, releaseIdentityControls } from "./story-release-event-identity.spec-support";

const identity = { tenantId: tenantId("fixture-tenant"), workspaceId: workspaceId("fixture-workspace"),
  scope: { type: "workspace" as const } };
const clusterer = new StoryClusteringService({ now: () => new Date("2026-09-01T14:00:00Z") });
const base = releaseIdentityControls[0];
const left = releaseEvidence(base.leftText);
const right = releaseEvidence(base.rightText, "right", "x-twitter");
const key = verifiedStoryRelationPairKey(left.feedItemId, right.feedItemId);
const approved = new Set([key]);

const candidatesFor = (a = left, b = right) => buildStoryRelationCandidates({
  selection: clusterer.cluster({ identity, items: [a, b], limit: 10 }), evidence: [a, b],
});

describe("verification-only primary release identity", () => {
  it.each(releaseIdentityControls)("honors independent critique: $name", (control) => {
    const a = releaseEvidence(control.leftText);
    const b = releaseEvidence(control.rightText, "right", "x-twitter");
    expect(samePrimaryReleaseEvent(a, b)).toBe(control.sameStory);
    expect(isVerifiedStoryRelationGuardEligible(a, b, policy)).toBe(control.sameStory);
    expect(isVerifiedStoryRelationGuardEligible(b, a, policy)).toBe(control.sameStory);
    expect(candidatesFor(a, b).length > 0).toBe(control.sameStory);
    // Direct adversarial approval tests the final guard independently of retrieval.
    expect(belongsToVerifiedStoryCluster(a, [b], policy, approved)).toBe(control.sameStory);
    expect(clusterer.cluster({ identity, items: [a, b], limit: 10,
      verifiedStoryRelationPairs: approved }).clusters).toHaveLength(control.sameStory ? 1 : 2);
  });

  it.each([
    ["Orion", "Vela", "7.3"], ["Northstar", "Juniper", "2.8"], ["Vertex", "Atlas", "14.6"],
  ])("binds unseen publisher/product/version %s %s %s", (publisher, product, version) => {
    const a = releaseEvidence(`${publisher} introduces ${product} ${version} for coding at lower cost\n${publisher} releases ${product} ${version} on September 1. The model improves agentic coding workloads.`);
    const b = releaseEvidence(`${publisher} launches ${product} ${version} compared to its predecessor\n${publisher} releases ${product} ${version} on September 1. The model improves agentic coding workloads vs its predecessor.`, "right", "x-twitter");
    expect(samePrimaryReleaseEvent(a, b)).toBe(true);
    expect(candidatesFor(a, b)).toHaveLength(1);
    expect(belongsToVerifiedStoryCluster(a, [b], policy, approved)).toBe(true);
    expect(isDeterministicCrossProviderStoryMatch(a, b, policy)).toBe(false);
  });

  it("accepts an attributed result summary of one model in a joint release", () => {
    const a = releaseEvidence("Orion introduces Vela 7.3 and Lyra 7.3 at lower cost\nOrion releases Vela 7.3 and Lyra 7.3 for coding. Both are available today, with safeguards for security research.");
    const b = releaseEvidence("Vela 7.3 is stronger on coding benchmarks\nVela 7.3 is stronger on coding benchmarks (says Orion). Its release improves research tasks and costs less. Safeguards reduce false positives. Testing time!", "right", "x-twitter");
    expect(storyReleaseEventIdentity(b)).toMatchObject({ publisher: "orion", targets: ["vela@7.3"] });
    expect(samePrimaryReleaseEvent(a, b)).toBe(true);
    expect(belongsToVerifiedStoryCluster(a, [b], policy, approved)).toBe(true);
  });

  it.each([
    ["different publisher", base.rightText.replaceAll("OpenAI", "Elsewhere")],
    ["explicit event date", base.rightText.replaceAll("September 1", "August 1")],
    ["preview stage", base.rightText.replaceAll("for coding", "for coding in beta preview")],
    ["independent work after release lead", base.rightText + " We tested the model ourselves and published our own benchmark."],
    ["missing attribution", "GPT-9.1 is better on a coding benchmark\nGPT-9.1 is better on a coding benchmark. This release covers agentic tasks."],
    ["unknown object attachment", "OpenAI launches a detector using GPT-9.1\nOpenAI releases a detector using GPT-9.1 for coding output."],
    ["unversioned target", "OpenAI launches GPT for coding\nOpenAI releases GPT for coding workloads compared to GPT-9.1."],
  ])("does not override facets for %s", (_name, text) => {
    const other = releaseEvidence(text, "right", "x-twitter");
    expect(samePrimaryReleaseEvent(left, other)).toBe(false);
    expect(isVerifiedStoryRelationGuardEligible(left, other, policy)).toBe(false);
    expect(belongsToVerifiedStoryCluster(left, [other], policy, approved)).toBe(false);
  });

  it("binds dates outside the lead and distinguishes month/year evidence", () => {
    const original = releaseEvidence("Orion introduces Vela 7.3 at lower cost\nOrion releases Vela 7.3 for coding. This release occurred on September 1, 2026.");
    const comparison = releaseEvidence("Orion launches Vela 7.3 compared to its predecessor\nOrion releases Vela 7.3 for coding. This release occurred on August 1, 2026.", "right", "x-twitter");
    expect(storyReleaseEventIdentity(original)?.eventDate).toBe("2026-09-01");
    expect(samePrimaryReleaseEvent(original, comparison)).toBe(false);
    const month = { ...comparison, sourceText: "Orion releases Vela 7.3 for coding. This release occurred in Sept 2026." };
    expect(samePrimaryReleaseEvent(original, month)).toBe(true);
    expect(samePrimaryReleaseEvent(original, { ...month, sourceText: month.sourceText.replace("2026", "2025") })).toBe(false);
  });

  it("accepts May dates and rejects conflicting or ambiguous dates", () => {
    const text = base.leftText.replaceAll("September 1", "May 4");
    expect(storyReleaseEventIdentity(releaseEvidence(text))?.eventDate).toBe("2026-05-04");
    expect(storyReleaseEventIdentity(releaseEvidence(base.leftText + " This release happened on August 1."))).toBeUndefined();
    expect(storyReleaseEventIdentity(releaseEvidence(base.leftText.replace("September 1", "01/09/2026")))).toBeUndefined();
  });

  it("requires a target-bound release citation for a first-person publisher", () => {
    const text = "Introducing Vela 7.3 at lower cost\nWe're introducing Vela 7.3 for coding. Read more: https://orion.example/vela-7-3";
    expect(storyReleaseEventIdentity(releaseEvidence(text))?.publisher).toBe("orion");
    expect(storyReleaseEventIdentity(releaseEvidence(text.replace("vela-7-3", "unrelated-7-3")))).toBeUndefined();
    expect(storyReleaseEventIdentity(releaseEvidence(text + " https://another.example/vela-7-3"))).toBeUndefined();
  });

  it("keeps safeguards as release details and preview as a separate action stage", () => {
    const release = releaseEvidence(base.leftText + " GPT-9.1 is available today.");
    const preview = releaseEvidence(base.rightText.replaceAll("for coding", "for coding in beta preview"), "right", "x-twitter");
    expect(samePrimaryReleaseEvent(release, preview)).toBe(false);
    expect(samePrimaryReleaseEvent(left, releaseEvidence(base.rightText +
      " Benign security requests have fewer false positives. Watermark safeguards are included in the model release.", "right", "x-twitter"))).toBe(true);
  });

  it("rejects partly overlapping joint launches and older comparator versions", () => {
    const a = releaseEvidence("Orion launches Vela 7.3 and Lyra 7.3\nOrion releases Vela 7.3 and Lyra 7.3.");
    const b = releaseEvidence("Orion launches Vela 7.3 and Lyra 7.4\nOrion releases Vela 7.3 and Lyra 7.4.");
    expect(samePrimaryReleaseEvent(a, b)).toBe(false);
    expect(storyReleaseEventIdentity(releaseEvidence(releaseIdentityControls[1].rightText))?.targets).toEqual(["gpt@9.2"]);
  });

  it.each([
    { ...right, publishedAt: new Date("2026-09-02T18:00:00.001Z") },
    { ...right, providerKey: "reddit" },
    { ...right, canonicalUrl: "https://left.example.test/different-event" },
  ])("preserves provider/time/canonical guards", (other) => {
    expect(isVerifiedStoryRelationGuardEligible(left, other, policy)).toBe(false);
    expect(belongsToVerifiedStoryCluster(left, [other], policy, approved)).toBe(false);
    expect(belongsToVerifiedStoryCluster(left, [other], policy, approved, approved)).toBe(false);
  });

  it("requires approval and keeps the 0.92 boundary and deterministic behavior", () => {
    const candidates = candidatesFor();
    expect(isDeterministicCrossProviderStoryMatch(left, right, policy)).toBe(false);
    expect(clusterer.cluster({ identity, items: [left, right], limit: 10 }).clusters).toHaveLength(2);
    for (const [sameStory, confidenceScore, accepted] of [[true, 0.919999, false], [false, 1, false], [true, 0.92, true]] as const) {
      const pairs = approvedStoryRelationPairs({ candidates,
        decisions: [{ leftFeedItemId: left.feedItemId, rightFeedItemId: right.feedItemId, sameStory, confidenceScore }] });
      expect(belongsToVerifiedStoryCluster(left, [right], policy, pairs)).toBe(accepted);
    }
    expect(belongsToVerifiedStoryCluster(left, [right], policy)).toBe(false);
    expect(belongsToVerifiedStoryCluster(left, [right], policy, new Set())).toBe(false);
  });

  it("shares the event predicate with strict-title final acceptance", () => {
    const a = releaseEvidence("OpenAI releases GPT-9.1 for agentic coding\nOpenAI releases GPT-9.1 on September 1. Lower cost for coding workloads.");
    const b = releaseEvidence("OpenAI released GPT-9.1 for agentic coding\nOpenAI releases GPT-9.1 on September 1. Better coding workloads vs its predecessor.", "right", "x-twitter");
    expect(strictStoryRelationTitleEvidence(a.title, b.title)).toBeDefined();
    expect(isDeterministicCrossProviderStoryMatch(a, b, policy)).toBe(false);
    expect(belongsToVerifiedStoryCluster(a, [b], policy, new Set(), approved)).toBe(true);
    const otherDate = { ...b, bodyPreview: b.bodyPreview!.replace("September", "August"),
      sourceText: b.sourceText!.replace("September", "August") };
    expect(belongsToVerifiedStoryCluster(a, [otherDate], policy, new Set(), approved)).toBe(false);
  });

  it("preserves the lexical floor even with affirmative release identity", () => {
    const uniqueContext = Array.from({ length: 100 }, (_, i) =>
      `context${String.fromCharCode(97 + Math.floor(i / 26))}${String.fromCharCode(97 + i % 26)}`).join(" ");
    const verbose = releaseEvidence(`OpenAI launches GPT-9.1\nOpenAI releases GPT-9.1. ${uniqueContext} vs distributed infrastructure.`, "right", "x-twitter");
    expect(samePrimaryReleaseEvent(left, verbose)).toBe(true);
    expect(candidatesFor(left, verbose)).toHaveLength(0);
    expect(isDeterministicCrossProviderStoryMatch(left, verbose, policy)).toBe(false);
  });

  it("does not turn an approved chain into every-member approval", () => {
    const third = { ...right, feedItemId: "third", providerKey: "hacker-news", canonicalUrl: "https://third.example.test/post" };
    const chain = new Set([key, verifiedStoryRelationPairKey(right.feedItemId, third.feedItemId)]);
    expect(belongsToVerifiedStoryCluster(left, [right, third], policy, chain)).toBe(false);
  });

  it("declines an exception when the full subject lies beyond the bounded text", () => {
    expect(samePrimaryReleaseEvent(left, { ...right, sourceText: `${right.sourceText}${" context".repeat(600)}` })).toBe(false);
  });
});
