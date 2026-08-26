import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import { StoryClusteringService } from "./story-clustering.service";
import { verifiedStoryRelationPairKey } from "./story-cluster-membership";

const now = new Date("2026-08-20T12:00:00.000Z");
const identity = {
  tenantId: tenantId("tenant-clique"),
  workspaceId: workspaceId("workspace-clique"),
  scope: { type: "workspace" as const },
};

describe("deterministic anti-poisoning story clustering", () => {
  it("does not infer A-C from approved A-B and B-C", () => {
    const items = threeItems();
    const result = cluster(items, pairs(items, [[0, 1], [1, 2]]));
    expect(memberships(result.clusters)).toEqual([
      ["a", "b"],
      ["c"],
    ]);
  });

  it("applies a complete three-base-cluster clique", () => {
    const items = threeItems();
    const result = cluster(items, pairs(items, [[0, 1], [0, 2], [1, 2]]));
    expect(memberships(result.clusters)).toEqual([["a", "b", "c"]]);
  });

  it("preserves a fifth cluster when the four-base-cluster cap is reached", () => {
    const items = [
      eventItem("a", "x-twitter", "Acme acquired Beta production western schedule"),
      eventItem("b", "reddit", "Beta acquisition by Acme eastern filing details"),
      eventItem("c", "hacker-news", "Acme acquiring Beta global closing notice"),
      eventItem("d", "github-repo-radar", "Beta acquired by Acme investor transaction report"),
      eventItem("e", "rss", "Acme acquisition of Beta workforce integration bulletin"),
    ];
    const allPairs: [number, number][] = [];
    for (let left = 0; left < items.length; left += 1) {
      for (let right = left + 1; right < items.length; right += 1) {
        allPairs.push([left, right]);
      }
    }
    const result = cluster(items, pairs(items, allPairs));
    expect(result.clusters).toHaveLength(2);
    expect(memberships(result.clusters).map((memberIds) => memberIds.length)
      .sort()).toEqual([1, 4]);
    expect(memberships(result.clusters).flat().sort()).toEqual([
      "a", "b", "c", "d", "e",
    ]);
  });

  it("keeps a larger deterministic cluster intact but refuses model-assisted growth", () => {
    const deterministic = ["x-twitter", "reddit", "hacker-news",
      "github-repo-radar", "rss"].map((providerKey, index) => ({
        ...eventItem(`base-${index}`, providerKey,
          "Acme acquired Beta confirmed production transaction"),
        canonicalUrl: "https://origin.example.test/acme-beta",
      }));
    const external = eventItem("external", "mastodon",
      "Beta acquisition by Acme confirmed filing");
    const result = cluster([...deterministic, external], new Set([
      verifiedStoryRelationPairKey(deterministic[0]!.feedItemId,
        external.feedItemId),
    ]));
    expect(memberships(result.clusters).map((memberIds) => memberIds.length)
      .sort()).toEqual([1, 5]);
    expect(memberships(result.clusters).flat().sort()).toEqual([
      "base-0", "base-1", "base-2", "base-3", "base-4", "external",
    ]);
  });

  it("rejects a fully attested union when member details contradict", () => {
    const left = eventItem("left", "x-twitter",
      "Acme released Platform 2.0 production western migration schedule");
    const right = eventItem("right", "reddit",
      "Platform 3.0 released by Acme eastern package filing details");
    expect(cluster([left, right], new Set([
      verifiedStoryRelationPairKey(left.feedItemId, right.feedItemId),
    ])).clusters).toHaveLength(2);
  });

  it("is identical for every input permutation", () => {
    const items = threeItems();
    const verified = pairs(items, [[0, 1], [0, 2], [1, 2]]);
    const outputs = permutations(items).map((permutation) => {
      const result = cluster(permutation, verified);
      return {
        memberships: memberships(result.clusters),
        representatives: result.clusters.map((value) =>
          value.representativeFeedItemId),
      };
    });
    expect(outputs.every((output) => JSON.stringify(output) ===
      JSON.stringify(outputs[0]))).toBe(true);
  });
});

const cluster = (
  items: readonly SummaryEvidenceItem[],
  verifiedStoryRelationPairs: ReadonlySet<string>,
) => new StoryClusteringService({ now: () => now }).cluster({
  identity,
  items,
  limit: items.length,
  verifiedStoryRelationPairs,
  now,
});

const threeItems = (): readonly SummaryEvidenceItem[] => [
  eventItem("a", "x-twitter", "Acme acquired Beta production western schedule"),
  eventItem("b", "reddit", "Beta acquisition by Acme eastern filing details"),
  eventItem("c", "hacker-news", "Acme acquiring Beta global closing notice"),
];

const eventItem = (
  feedItemId: string,
  providerKey: string,
  title: string,
): SummaryEvidenceItem => ({
  feedItemId, providerKey, title,
  sourceItemId: `source:${feedItemId}`,
  sourceBindingId: `binding:${feedItemId}`,
  interestId: "interest",
  canonicalUrl: `https://${providerKey}.example.test/${feedItemId}`,
  publishedAt: now,
  observedAt: now,
  score: 1,
  whyImportant: [],
});

const pairs = (
  items: readonly SummaryEvidenceItem[],
  indexes: readonly (readonly [number, number])[],
): ReadonlySet<string> => new Set(indexes.map(([left, right]) =>
  verifiedStoryRelationPairKey(items[left]!.feedItemId,
    items[right]!.feedItemId)));

const memberships = (clusters: readonly {
  representativeFeedItemId: string;
  duplicateFeedItemIds: readonly string[];
}[]): readonly (readonly string[])[] => clusters.map((value) =>
  [value.representativeFeedItemId, ...value.duplicateFeedItemIds].sort())
  .sort((left, right) => left[0]!.localeCompare(right[0]!));

const permutations = <T>(values: readonly T[]): readonly (readonly T[])[] =>
  values.length <= 1 ? [values] : values.flatMap((value, index) =>
    permutations([...values.slice(0, index), ...values.slice(index + 1)])
      .map((tail) => [value, ...tail]));
