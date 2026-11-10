import { defaultSummaryGenerationPolicy } from "../../domain";
import type { SummaryModelInput } from "../../ports";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import {
  repositorySignalPromptBlock,
  repositoryTrendPromptBlock,
} from "./openai-responses-summary-repository-evidence";
import { buildPromptPayload } from "./openai-responses-summary-prompt";

describe("GitHub repository metadata as untrusted summary evidence", () => {
  it("keeps non-object and unrelated metadata outside special prompt projections", () => {
    for (const value of [null, undefined, "unexpected", [], { kind: "unknown" }]) {
      expect(repositoryTrendPromptBlock(value)).toBeUndefined();
      expect(repositorySignalPromptBlock(value)).toBeUndefined();
    }
  });

  it("preserves both legacy and archive projections for repository trends", () => {
    const metadata = {
      kind: "github_repository_trend",
      repository: "synthetic/project",
      trend: { window: "7d", stars: 8 },
    };
    expect(repositoryTrendPromptBlock(metadata)).toMatchObject({
      repository: "synthetic/project",
      trend: { window: "7d", stars: 8 },
    });
    expect(repositorySignalPromptBlock(metadata)).toMatchObject({
      source: "gh_archive_repo_radar",
      repository: "synthetic/project",
      trend: { window: "7d", stars: 8 },
    });
  });

  it("retains rank/window semantics for GitHub Trending without inventing a legacy trend", () => {
    const metadata = {
      kind: "github_trending_page_repository",
      repository: "synthetic/project",
      trending: { rank: 2, starsGained: 30, window: "daily" },
    };
    expect(repositoryTrendPromptBlock(metadata)).toBeUndefined();
    expect(repositorySignalPromptBlock(metadata)).toMatchObject({
      source: "github_trending_page",
      trending: { rank: 2, starsGained: 30, window: "daily" },
    });
  });

  it("keeps provider-owned instructions and metadata scoped to its citation-bearing evidence", () => {
    const observedAt = new Date("2026-06-21T10:00:00.000Z");
    const metadata = {
      kind: "github_repository_trend",
      repository: "synthetic/project",
      trend: { stars: 8 },
    };
    const input: SummaryModelInput = {
      tenantId: tenantId("tenant-synthetic"),
      workspaceId: workspaceId("workspace-synthetic"),
      interestId: "interest-synthetic",
      requestedAt: observedAt,
      policy: defaultSummaryGenerationPolicy(),
      evidence: {
        sourceWindow: {
          windowId: "window-synthetic",
          startedAt: observedAt,
          endedAt: observedAt,
          selectedFeedItemIds: ["feed-1"],
        },
        items: [{
          feedItemId: "feed-1",
          sourceItemId: "source-1",
          sourceBindingId: "binding-1",
          providerKey: "github",
          title: "Synthetic repository trend",
          providerMetadata: metadata,
          observedAt,
        }],
      },
    };
    const payload = JSON.parse(buildPromptPayload(input)) as {
      evidence: readonly { citationId: string; repositoryTrend: unknown;
        repositorySignal: unknown; providerMetadata: unknown }[];
    };
    expect(payload.evidence[0]).toMatchObject({
      citationId: "c1",
      providerMetadata: metadata,
      repositoryTrend: { repository: "synthetic/project", trend: { stars: 8 } },
      repositorySignal: { source: "gh_archive_repo_radar", trend: { stars: 8 } },
    });
  });
});
