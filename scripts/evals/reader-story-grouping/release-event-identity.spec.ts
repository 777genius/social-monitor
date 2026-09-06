import { belongsToVerifiedStoryCluster, isDeterministicCrossProviderStoryMatch,
  isVerifiedStoryRelationGuardEligible, verifiedStoryRelationPairKey } from
  "@social-monitor/summary/domain/services/story-cluster-membership";
import { samePrimaryReleaseEvent, storyReleaseEventIdentity } from
  "@social-monitor/summary/domain/services/story-release-event-identity";
import { STORY_RANKING_POLICY_V1 as policy } from
  "@social-monitor/summary/domain/policies/story-ranking-policy";
import { loadDataset } from "./dataset";
import { applyDecisions, pairKey, prepareBlock, together } from "./replay";

const data = loadDataset();
const releaseBlock = data.blocks.find((b) => b.id === "fable-release")!;
const positives = data.cases.filter((c) => /^RSG-00[1-5]$/.test(c.id));
const decisionsFor = (p: Awaited<ReturnType<typeof prepareBlock>>) => p.candidates.map((c) => ({
  leftFeedItemId: c.leftFeedItemId, rightFeedItemId: c.rightFeedItemId,
  sameStory: true, confidenceScore: 1,
}));

describe("frozen real release event retrieval and isolated acceptance", () => {
  it.each(positives)("recovers $id in isolation and the original block, without auto-merge", async (gold) => {
    const pair = await prepareBlock(data, { ...releaseBlock, postRefs: [gold.left, gold.right] });
    const block = await prepareBlock(data, releaseBlock);
    const [left, right] = pair.evidence;
    const key = verifiedStoryRelationPairKey(left!.feedItemId, right!.feedItemId);
    expect(storyReleaseEventIdentity(left!)).toBeDefined();
    expect(storyReleaseEventIdentity(right!)).toBeDefined();
    expect(isVerifiedStoryRelationGuardEligible(left!, right!, policy)).toBe(true);
    expect(isDeterministicCrossProviderStoryMatch(left!, right!, policy)).toBe(false);
    expect(pair.candidates.some((c) => pairKey(c) === key)).toBe(true);
    expect(block.candidates.some((c) => pairKey(c) === key)).toBe(true);
    expect(together(applyDecisions(pair).relationSelection, left!.feedItemId, right!.feedItemId)).toBe(false);
    expect(together(applyDecisions(pair, decisionsFor(pair)).relationSelection, left!.feedItemId, right!.feedItemId)).toBe(true);
    expect(applyDecisions(pair, decisionsFor(pair).map((d) => ({ ...d, confidenceScore: 0.919999 }))).graduatedRelations).toHaveLength(0);
  });

  it("retains every old cross-provider positive and all scored negative controls", async () => {
    let retrieved = 0;
    for (const block of data.blocks) {
      const p = await prepareBlock(data, block);
      const outcome = applyDecisions(p, decisionsFor(p));
      for (const gold of data.cases.filter((c) => c.blockId === block.id)) {
        const a = data.replayByRef.get(gold.left)!.evidence;
        const b = data.replayByRef.get(gold.right)!.evidence;
        const key = verifiedStoryRelationPairKey(a.feedItemId, b.feedItemId);
        if (gold.productAction === "merge_if_admitted" && p.candidates.some((c) => pairKey(c) === key)) retrieved++;
        if (gold.productAction !== "keep_separate") continue;
        expect(together(outcome.relationSelection, a.feedItemId, b.feedItemId)).toBe(false);
        expect(p.candidates.some((c) => pairKey(c) === key)).toBe(false);
      }
    }
    expect(retrieved).toBe(15);
  });

  it("grants no release exception to within-window cross-provider equivalents of separate subjects", () => {
    // Preserve originals; these are diagnostic copies, not new frozen gold labels.
    for (const id of ["RSG-009", "RSG-010", "RSG-011", "RSG-012", "RSG-013", "RSG-015", "RSG-016", "RSG-022", "RSG-023", "RSG-046", "RSG-047", "RSG-048"]) {
      const gold = data.cases.find((c) => c.id === id)!;
      const a = { ...data.replayByRef.get(gold.left)!.evidence, providerKey: "reddit", canonicalUrl: "https://left.example.test/post" };
      const b = { ...data.replayByRef.get(gold.right)!.evidence, providerKey: "x-twitter", canonicalUrl: "https://right.example.test/post", publishedAt: a.publishedAt };
      expect(storyReleaseEventIdentity(a) === undefined || storyReleaseEventIdentity(b) === undefined).toBe(true);
      expect(samePrimaryReleaseEvent(a, b)).toBe(false);
    }
  });

  it("records the pre-existing direct-approval limitation for two independent benchmarks", async () => {
    const gold = data.cases.find((c) => c.id === "RSG-014")!;
    const a = data.replayByRef.get(gold.left)!.evidence;
    const b = data.replayByRef.get(gold.right)!.evidence;
    const p = await prepareBlock(data, data.blocks.find((block) => block.id === gold.blockId)!);
    const key = verifiedStoryRelationPairKey(a.feedItemId, b.feedItemId);
    expect(samePrimaryReleaseEvent(a, b)).toBe(false);
    expect(p.candidates.some((c) => pairKey(c) === key)).toBe(false);
    // This pre-existing compatible-facet path is outside the new exception.
    // Adversarial raw pairs bypass retrieval's similarity threshold; they are
    // not a normalized verifier result from this block's requested candidates.
    expect(belongsToVerifiedStoryCluster(a, [b], policy, new Set([key]))).toBe(true);
  });

  it("records the exclusive-cluster obstruction across all 720 orders", async () => {
    const p = await prepareBlock(data, releaseBlock);
    const pairs = new Set(p.candidates.map(pairKey));
    const histogram: Record<number, number> = {};
    for (const items of permutations(p.evidence)) {
      const selected = p.clusterer.cluster({ ...p.clusterParams, items, verifiedStoryRelationPairs: pairs });
      const count = positives.filter((g) => together(selected,
        data.postByRef.get(g.left)!.feedItemId, data.postByRef.get(g.right)!.feedItemId)).length;
      histogram[count] = (histogram[count] ?? 0) + 1;
      expect(selected.clusters.every((c) => c.providerKeys.length === c.duplicateFeedItemIds.length + 1)).toBe(true);
    }
    expect(histogram).toEqual({ 0: 120, 1: 120, 2: 360, 3: 120 });
    expect(histogram[5]).toBeUndefined();
  });
});

const permutations = <T>(items: readonly T[]): T[][] => items.length <= 1
  ? [[...items]] : items.flatMap((item, i) =>
    permutations(items.filter((_, j) => i !== j)).map((rest) => [item, ...rest]));
