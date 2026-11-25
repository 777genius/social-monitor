import {
  tenantId,
  workspaceId,
  type JsonObject,
} from "@social-monitor/shared-kernel";

import { SourceItem } from "../../domain";
import type { SourceCandidateScreening } from "./source-candidate-memory-coordinator";
import { prepareSourceEngagementSamples } from "./source-engagement-sample-coordinator";

describe("source engagement sample coordinator", () => {
  it("keeps the strongest duplicate mutation and recovers an unprojected new item", () => {
    const first = sourceItem("first");
    const latest = sourceItem("latest");
    const result = prepareSourceEngagementSamples({
      providerKey: "x-twitter",
      persistedItems: [first, latest],
      savedItems: [
        {
          externalId: "x-twitter:1",
          sourceItemId: "source-1",
          persistedItem: first,
          inserted: true,
          mutationKind: "inserted",
        },
        {
          externalId: "x-twitter:1",
          sourceItemId: "source-1",
          persistedItem: latest,
          inserted: false,
          mutationKind: "unchanged",
        },
      ],
      candidateScreening: screening("new"),
    });

    expect(result.sourceItemsForFullProjection).toHaveLength(1);
    expect(
      result.sourceItemsForFullProjection[0]?.toSnapshot().title,
    ).toBe("latest");
    expect(result.engagementSamples).toHaveLength(1);
    expect(result.engagementSamples[0]?.refreshReadModels).toBe(false);
  });

  it("full-projects a reliable new retry even when source persistence is unchanged", () => {
    const retry = sourceItem("retry");
    const result = prepareSourceEngagementSamples({
      providerKey: "x-twitter",
      persistedItems: [retry],
      savedItems: [
        {
          externalId: "x-twitter:1",
          sourceItemId: "source-1",
          persistedItem: retry,
          inserted: false,
          mutationKind: "unchanged",
        },
      ],
      candidateScreening: screening("new"),
    });

    expect(result.sourceItemsForFullProjection).toHaveLength(1);
    expect(result.engagementSamples[0]?.refreshReadModels).toBe(false);
  });

  it("carries a Reddit providerScore-only post into engagement projection", () => {
    const item = sourceItem("reddit-provider-score", {
      externalId: "reddit:provider-score",
      metadata: { kind: "reddit_post", providerScore: 42 },
    });
    const result = prepareSourceEngagementSamples({
      providerKey: "reddit",
      persistedItems: [item],
      savedItems: [{
        externalId: "reddit:provider-score",
        sourceItemId: item.toSnapshot().id,
        persistedItem: item,
        inserted: true,
        mutationKind: "inserted",
      }],
      candidateScreening: screening("new", "reddit", "reddit:provider-score"),
    });

    expect(result.engagementSamples).toMatchObject([{
      externalId: "reddit:provider-score",
      metrics: { score: 42 },
      providerMetadataPatch: { providerScore: 42 },
    }]);
  });

  it("drops a Reddit sample when score aliases conflict", () => {
    const item = sourceItem("reddit-conflicting-score", {
      externalId: "reddit:conflicting-score",
      metadata: { kind: "reddit_post", score: 42, providerScore: 43 },
    });
    const result = prepareSourceEngagementSamples({
      providerKey: "reddit",
      persistedItems: [item],
      savedItems: [{
        externalId: "reddit:conflicting-score",
        sourceItemId: item.toSnapshot().id,
        persistedItem: item,
        inserted: true,
        mutationKind: "inserted",
      }],
      candidateScreening: screening("new", "reddit", "reddit:conflicting-score"),
    });

    expect(result.engagementSamples).toEqual([]);
  });
});

const sourceItem = (
  title: string,
  overrides: {
    readonly externalId?: string;
    readonly metadata?: JsonObject;
  } = {},
): SourceItem =>
  SourceItem.ingest({
    id: "source-1",
    tenantId: tenantId("tenant"),
    workspaceId: workspaceId("workspace"),
    sourceBindingId: "binding",
    externalId: overrides.externalId ?? "x-twitter:1",
    canonicalUrl: "https://x.com/example/status/1",
    title,
    body: "body",
    publishedAt: new Date("2026-07-10T11:00:00Z"),
    ingestedAt: new Date("2026-07-10T12:00:00Z"),
    metadata: overrides.metadata ?? { kind: "x_post", likes: 10 },
  });

const screening = (
  kind: "new" | "content_changed",
  providerKey = "x-twitter",
  externalId = "x-twitter:1",
): SourceCandidateScreening => ({
  memoryScope: {
    tenantId: tenantId("tenant"),
    workspaceId: workspaceId("workspace"),
    interestId: "interest",
    sourceBindingId: "binding",
    providerKey,
    scopeFingerprint: "scope",
    policyVersion: "v1",
  },
  candidates: [],
  classifications: [
    { externalId, kind, legacyFallback: false },
  ],
  previousExpiresAtByExternalId: new Map(),
  itemsToEnrich: [],
  itemsForEngagementRefresh: [],
  itemsToProcess: [],
  suppressedExternalIds: [],
  legacyFallbackExternalIds: [],
  classificationReliable: true,
});
