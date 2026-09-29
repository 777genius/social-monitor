import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import { StoryClusteringService } from "./story-clustering.service";

const now = new Date("2026-09-20T12:00:00.000Z");
const identity = { tenantId: tenantId("tenant-1"),
  workspaceId: workspaceId("workspace-1"), scope: { type: "workspace" as const } };
const item = (index: number, canonicalUrl: string): SummaryEvidenceItem => ({
  feedItemId: `feed-${index}`, sourceItemId: `source-${index}`,
  sourceBindingId: `binding-${index}`, interestId: "interest-ai",
  providerKey: "rss", canonicalUrl,
  title: `Distinct release ${index}`, bodyPreview: `Description ${index} ${"details ".repeat(650)}`,
  publishedAt: now, observedAt: now, score: 1, whyImportant: [],
});

describe("StoryClusteringService comparison budget", () => {
  const service = new StoryClusteringService({ now: () => now });

  it("reports exhausted work for 200 distinct 5 KiB items without a partial selection", () => {
    const items = Array.from({ length: 200 }, (_, index) =>
      item(index, `https://example.com/stories/${index}`));
    expect((items[0]?.bodyPreview ?? "").length).toBeGreaterThan(5_000);

    expect(service.clusterWithinComparisonBudget({ identity, items,
      limit: items.length, now }, 4_096)).toEqual({ kind: "budget_exhausted" });
    expect(items).toHaveLength(200);
  });

  it("preserves ordinary clustering when its full relation work fits", () => {
    const items = [item(1, "https://example.com/one"),
      item(2, "https://example.com/one")];
    const result = service.clusterWithinComparisonBudget({ identity, items,
      limit: 2, now }, 4_096);

    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.selection.clusters).toHaveLength(1);
    expect(result.selection.clusters[0]?.duplicateFeedItemIds).toEqual(["feed-2"]);
  });
});
