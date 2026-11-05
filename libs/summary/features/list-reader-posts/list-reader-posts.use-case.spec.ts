import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import type { ReaderPost } from "../../application/contracts/reader-post-catalog";
import { ListReaderPostsUseCase } from "./list-reader-posts.use-case";

const post = (id: string, engagement: number | null, usefulness: string | null = "useful"): ReaderPost => ({
  id, sourceItemId: id, providerKey: "reddit", providerFamily: "reddit",
  title: "Synthetic post", bodyPreview: "Synthetic source excerpt", canonicalUrl: "https://example.com/" + id,
  publishedAt: "2026-10-30T00:00:00.000000Z", engagement,
  engagementObservedAt: "2026-10-31T00:00:00.000000Z", usefulness,
  relevance: usefulness === null ? null : "relevant",
});
const query = {
  tenantId: tenantId("tenant-test"), workspaceId: workspaceId("workspace-test"),
  startedAt: new Date("2026-10-30T00:00:00Z"), endedAt: new Date("2026-10-31T00:00:00Z"),
  order: "likes" as const, limit: 2,
};

const clock = { now: () => new Date("2026-11-02T12:00:00Z") };

describe("all reader posts", () => {
  it("paginates raw X Likes independently of weighted Model engagement", async () => {
    const posts = [
      { ...post("reposted", 210), providerKey: "x-twitter", providerFamily: "x", likeCount: 10 },
      { ...post("liked", 40), providerKey: "x-twitter", providerFamily: "x", likeCount: 40 },
      ...[1, 2, 3].map(count => ({ ...post(`x-${count}`, count), providerKey: "x-twitter", providerFamily: "x", likeCount: count })),
    ];
    const useCase = new ListReaderPostsUseCase({ read: async () => posts }, clock);
    const likes = await useCase.execute({ ...query, order: "likes", limit: 1 });
    const model = await useCase.execute({ ...query, order: "model", limit: 1 });
    expect(likes.ok && likes.value.items[0]).toMatchObject({ id: "liked", likeCount: 40, engagement: 40 });
    expect(model.ok && model.value.items[0]).toMatchObject({ id: "reposted", likeCount: 10, engagement: 210 });
  });
  it("accepts exactly 2000 candidates while paginating the complete pool", async () => {
    const posts = Array.from({ length: 2000 }, (_, index) => post(`post-${index}`, index));
    const result = await new ListReaderPostsUseCase({ read: async () => posts }, clock).execute(query);
    expect(result.ok && result.value.total).toBe(2000);
    expect(result.ok && result.value.items).toHaveLength(2);
  });
  it("rejects 2001 candidates before exclusions can hide overflow", async () => {
    const posts = Array.from({ length: 2001 }, (_, index) => post(`post-${index}`, index));
    const result = await new ListReaderPostsUseCase({ read: async () => posts }, clock)
      .execute({ ...query, excludedProviders: ["reddit"] });
    expect(result).toMatchObject({ ok: false, error: {
      code: "operation.conflict", message: "Post window is too large; choose a shorter period",
    } });
  });
  it("never mixes GitHub Trending repositories into either post order or counts", async () => {
    const useCase = new ListReaderPostsUseCase({ read: async () => [
      post("post", 1), { ...post("trending", 99999, "important"), providerKey: "github-trending-page", providerFamily: "github_radar" },
    ] }, clock);
    for (const order of ["model", "likes"] as const) {
      const result = await useCase.execute({ ...query, order });
      expect(result.ok && result.value.items.map((item) => item.id)).toEqual(["post"]);
      expect(result.ok && result.value.total).toBe(1);
      expect(result.ok && result.value.providerKeys).toEqual(["reddit"]);
    }
  });

  it("sorts the entire pool before pagination, including unselected and unassessed posts", async () => {
    const useCase = new ListReaderPostsUseCase({ read: async () => [post("a", 2), post("b", null), post("c", 99, null), post("d", 8)] }, clock);
    const first = await useCase.execute(query);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.items.map((item) => item.id)).toEqual(["c", "d"]);
    expect(first.value.total).toBe(4);
    const second = await useCase.execute({ ...query, cursor: first.value.nextCursor });
    expect(second.ok && second.value.items.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("places missing assessments after assessed posts in model order", async () => {
    const useCase = new ListReaderPostsUseCase({ read: async () => [post("a", 99999, null), post("b", 1, "important"), post("c", 50, "context")] }, clock);
    const result = await useCase.execute({ ...query, order: "model", limit: 12 });
    expect(result.ok && result.value.items.map((item) => item.id)).toEqual(["b", "c", "a"]);
  });

  it("rejects stale or cross-scope cursors instead of repeating or omitting rows", async () => {
    let posts = [post("a", 2), post("b", 3), post("c", 4)];
    const useCase = new ListReaderPostsUseCase({ read: async () => posts }, clock);
    const first = await useCase.execute(query);
    if (!first.ok) throw first.error;
    const changedScope = await useCase.execute({ ...query, workspaceId: workspaceId("other"), cursor: first.value.nextCursor });
    expect(changedScope.ok).toBe(false);
    posts = [post("a", 100), post("b", 3), post("c", 4)];
    const changedPool = await useCase.execute({ ...query, cursor: first.value.nextCursor });
    expect(changedPool.ok).toBe(false);
  });

  it("filters before counting/paging and preserves the provider filter roster", async () => {
    const useCase = new ListReaderPostsUseCase({ read: async () => [post("a", 2), { ...post("b", 99), providerKey: "hacker-news" }] }, clock);
    const result = await useCase.execute({ ...query, excludedProviders: ["reddit"] });
    expect(result.ok && result.value.total).toBe(1);
    expect(result.ok && result.value.providerKeys).toEqual(["hacker-news", "reddit"]);
  });
});
