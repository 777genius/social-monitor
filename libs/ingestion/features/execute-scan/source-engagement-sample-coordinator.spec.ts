import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

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
          inserted: true,
          mutationKind: "inserted",
        },
        {
          externalId: "x-twitter:1",
          sourceItemId: "source-1",
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
    const result = prepareSourceEngagementSamples({
      providerKey: "x-twitter",
      persistedItems: [sourceItem("retry")],
      savedItems: [
        {
          externalId: "x-twitter:1",
          sourceItemId: "source-1",
          inserted: false,
          mutationKind: "unchanged",
        },
      ],
      candidateScreening: screening("new"),
    });

    expect(result.sourceItemsForFullProjection).toHaveLength(1);
    expect(result.engagementSamples[0]?.refreshReadModels).toBe(false);
  });
});

const sourceItem = (title: string): SourceItem =>
  SourceItem.ingest({
    id: "source-1",
    tenantId: tenantId("tenant"),
    workspaceId: workspaceId("workspace"),
    sourceBindingId: "binding",
    externalId: "x-twitter:1",
    canonicalUrl: "https://x.com/example/status/1",
    title,
    body: "body",
    publishedAt: new Date("2026-07-10T11:00:00Z"),
    ingestedAt: new Date("2026-07-10T12:00:00Z"),
    metadata: { kind: "x_post", likes: 10 },
  });

const screening = (
  kind: "new" | "content_changed",
): SourceCandidateScreening => ({
  memoryScope: {
    tenantId: tenantId("tenant"),
    workspaceId: workspaceId("workspace"),
    interestId: "interest",
    sourceBindingId: "binding",
    providerKey: "x-twitter",
    scopeFingerprint: "scope",
    policyVersion: "v1",
  },
  candidates: [],
  classifications: [
    { externalId: "x-twitter:1", kind, legacyFallback: false },
  ],
  previousExpiresAtByExternalId: new Map(),
  itemsToEnrich: [],
  itemsForEngagementRefresh: [],
  itemsToProcess: [],
  suppressedExternalIds: [],
  legacyFallbackExternalIds: [],
  classificationReliable: true,
});
