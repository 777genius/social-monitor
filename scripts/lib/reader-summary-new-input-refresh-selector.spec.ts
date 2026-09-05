import { FeedItem } from "@social-monitor/feed/domain";
import { InMemoryFeedItemReadRepository } from "@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository";
import { FixedClock, tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { preflightRefreshSelection } from "./reader-summary-new-input-refresh-capture";
import { refreshManifest, refreshNow } from "./reader-summary-new-input-refresh.spec-support";

describe("complete canonical current selector for historical inputs", () => {
  it("reads beyond a top slice and rejects metric authority after the true cutoff", async () => {
    const m = refreshManifest();
    const feed = new InMemoryFeedItemReadRepository();
    for (let i = 0; i < 651; i++) feed.upsert(FeedItem.publish({
      id: `feed-${i}`, tenantId: tenantId(m.tenantId), workspaceId: workspaceId(m.workspaceId),
      interestId: "interest", sourceItemId: `source-${i}`, sourceBindingId: "binding",
      providerKey: "hacker-news", canonicalUrl: `https://example.test/${i}`,
      title: i === 650 ? "OpenAI releases an AI coding agent SDK with tool calling improvements" : `Synthetic below-threshold item ${i}`,
      bodyPreview: "OpenAI released a developer SDK for AI coding agents with improved tool calling, model context management and reproducible inference benchmarks.",
      publishedAt: new Date("2026-09-03T12:00:00Z"), observedAt: new Date("2026-09-03T12:01:00Z"),
      providerMetadata: { kind: "hacker_news_story", points: i === 650 ? 500 : 1, comments: 10 },
    }));
    const original = feed.readPromotionSnapshot.bind(feed);
    const snapshot = jest.spyOn(feed, "readPromotionSnapshot").mockImplementation(async (query) => {
      const result = await original(query);
      return !result.ok ? result : { ...result, candidates: result.candidates.map((c) => ({ ...c,
        metricAuthority: { observedAt: new Date("2026-09-05T21:55:00Z"), regressionState: "stable" as const },
      })) };
    });
    const common = { feed, date: m.date, clock: new FixedClock(refreshNow) };
    expect(await preflightRefreshSelection({ ...common, observedThrough: new Date(m.prior.observedThrough) })).toBe(0);
    expect(await preflightRefreshSelection({ ...common, observedThrough: new Date(m.observedThrough) })).toBeGreaterThan(0);
    expect(snapshot).toHaveBeenLastCalledWith(expect.objectContaining({ observedThrough: new Date(m.observedThrough) }));
    const captured = await snapshot.mock.results.at(-1)!.value;
    expect(captured).toMatchObject({ exhausted: true, physicalRowsRead: 651 });
  });
});
