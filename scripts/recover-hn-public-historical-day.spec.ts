import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { HackerNewsClientPort, HackerNewsSearchOptions, HackerNewsStory } from "@social-monitor/ingestion/adapters/source/hacker-news/hacker-news-client.port";

import { recoverHnPublicHistoricalDay, utcDayWindow } from "./recover-hn-public-historical-day";

class FakeClient implements HackerNewsClientPort {
  readonly requests: { query: string; limit: number; options?: HackerNewsSearchOptions }[] = [];
  failQuery?: string;
  overflowQuery?: string;
  outsideQuery?: string;
  unique = false;
  commentQueries = false;

  async searchStories(query: string, limit: number, options?: HackerNewsSearchOptions): Promise<readonly HackerNewsStory[]> {
    this.requests.push({ query, limit, options });
    if (query === this.failQuery) throw new Error("fixture provider unavailable");
    const index = Number(/^term-(\d+)$/u.exec(query)?.[1] ?? 0);
    if (query === this.overflowQuery) return [101, 102, 103].map((id) => ({
      id, title: `Synthetic story ${id}`, time: Math.floor(options!.from!.getTime() / 1000) + 1, kind: "story" as const,
    }));
    return [{ id: this.unique ? index + 1 : 1, title: `Synthetic story ${index}`,
      time: Math.floor(options!.from!.getTime() / 1000) + (query === this.outsideQuery ? 86_401 : 1), kind: "story" }];
  }

  async searchComments(query: string, _limit: number, options?: HackerNewsSearchOptions): Promise<readonly HackerNewsStory[]> {
    if (!this.commentQueries || options?.from === undefined) throw new Error("unexpected comment request");
    const time = Math.floor(options.from.getTime() / 1000) + 10;
    const ten: HackerNewsStory = { id: 10, kind: "comment", storyId: 1, text: "Comment ten", time };
    return query === "comments-a" ? [ten] : query === "comments-b"
      ? [ten, { id: 11, kind: "comment", storyId: 1, text: "Comment eleven", time: time + 1 }] : [];
  }
  async getStory(id: number): Promise<HackerNewsStory | null> {
    if (!this.commentQueries || id !== 1) throw new Error("unexpected story expansion");
    return { id, kind: "story", title: "Synthetic root", time: Date.parse("2026-09-20T00:00:01Z") / 1000 };
  }
  async listStoryComments(): Promise<readonly HackerNewsStory[]> { throw new Error("unexpected comment expansion"); }
  async listStories(): Promise<readonly HackerNewsStory[]> { throw new Error("live listing is forbidden"); }
}

const passes = (count: number) => Array.from({ length: count }, (_, index) => ({
  mode: "search", target: "story", query: `term-${index}`, maxItems: 2,
}));

describe("private historical HN exporter", () => {
  const directories: string[] = [];
  afterEach(async () => { await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });

  async function fixture(finalCap = 100) {
    const directory = await mkdtemp(join(tmpdir(), "hn-public-exporter-test-"));
    directories.push(directory);
    const bindingsPath = join(directory, "bindings.json");
    const outputDir = join(directory, "export");
    await writeFile(bindingsPath, JSON.stringify([{ bindingId: "synthetic-binding", status: "ENABLED",
      config: { mode: "search", query: "base", maxItems: finalCap, scanPasses: passes(28), maxItemAgeHours: 48 } }]));
    return { bindingsPath, outputDir };
  }

  it("rejects invalid UTC days before output or provider calls", async () => {
    expect(() => utcDayWindow("2026-02-30")).toThrow("valid UTC");
    expect(() => utcDayWindow("2026-09-20T00:00:00Z")).toThrow("explicit");
    const paths = await fixture();
    const client = new FakeClient();
    await expect(recoverHnPublicHistoricalDay({ day: "2026-02-30", ...paths, client })).rejects.toThrow();
    expect(client.requests).toHaveLength(0);
    await expect(readFile(join(paths.outputDir, "manifest.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects split-day scans before provider calls so comments cannot be silently lost", async () => {
    const paths = await fixture();
    const client = new FakeClient();
    await expect(recoverHnPublicHistoricalDay({
      day: "2026-09-20", windowHours: 4, ...paths, client,
    })).rejects.toThrow("full UTC day");
    expect(client.requests).toHaveLength(0);
    await expect(readFile(join(paths.outputDir, "manifest.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("has no database, credential or production runtime dependency", async () => {
    const source = await readFile(join(process.cwd(), "scripts/recover-hn-public-historical-day.ts"), "utf8");
    expect(/from\s+["'][^"']*(?:prisma|persistence|database|production)/iu.test(source)).toBe(false);
    expect(/process\.env|connect\s*\(/u.test(source)).toBe(false);
  });

  it("runs all 28 configured passes with bounded complete requests and deterministic unique IDs", async () => {
    const paths = await fixture();
    const client = new FakeClient();
    // A poisoned DB setting has no path into this file-only acquisition.
    const priorDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "invalid://offline-only";
    try {
      const manifest = await recoverHnPublicHistoricalDay({ day: "2026-09-20", ...paths, client });
      expect(manifest.status).toBe("complete");
      expect(manifest.configuredPasses).toBe(28);
      expect(manifest.attemptedPassWindows).toBe(28);
      expect(manifest.commentPassCoverage).toBe("UNKNOWN");
      expect(client.requests).toHaveLength(28);
      expect(client.requests.every((request) => request.limit === 2 && request.options?.requireComplete === true &&
        request.options.from?.toISOString() === "2026-09-20T00:00:00.000Z" &&
        request.options.to?.toISOString() === "2026-09-21T00:00:00.000Z")).toBe(true);
      const contents = await readFile(join(paths.outputDir, "items.json"));
      const payload = JSON.parse(contents.toString()) as { ids: string[]; items: { publishedAt: string; publishedAtUnixSeconds: number }[] };
      expect(payload.ids).toEqual(["hn:1"]);
      expect(payload.items[0]?.publishedAt).toBe("2026-09-20T00:00:01.000Z");
      expect(payload.items[0]?.publishedAtUnixSeconds).toBe(1789862401);
      expect(manifest.itemsSha256).toBe(createHash("sha256").update(contents).digest("hex"));
      expect(manifest.passes.every((pass) => pass.status === "complete" && pass.returnedIds.length === 1)).toBe(true);
      expect((await stat(paths.outputDir)).mode & 0o777).toBe(0o700);
      expect((await stat(join(paths.outputDir, "items.json"))).mode & 0o777).toBe(0o600);
      const secondDir = `${paths.outputDir}-repeat`;
      await recoverHnPublicHistoricalDay({ day: "2026-09-20", bindingsPath: paths.bindingsPath,
        outputDir: secondDir, client: new FakeClient() });
      expect(await readFile(join(secondDir, "items.json"))).toEqual(contents);
      expect(await readFile(join(secondDir, "manifest.json"))).toEqual(await readFile(join(paths.outputDir, "manifest.json")));
      await expect(recoverHnPublicHistoricalDay({ day: "2026-09-20", ...paths, client })).rejects.toMatchObject({ code: "EEXIST" });
    } finally {
      if (priorDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = priorDatabaseUrl;
    }
  });

  it("records an unavailable pass and never calls a partial collection complete", async () => {
    const paths = await fixture();
    const client = new FakeClient();
    client.failQuery = "term-1";
    const manifest = await recoverHnPublicHistoricalDay({ day: "2026-09-20", ...paths, client });
    expect(manifest.status).toBe("incomplete");
    expect(manifest.passes.filter((pass) => pass.status === "incomplete").map((pass) => pass.index)).toEqual([1]);
    expect(manifest.passes[1]?.error).toContain("fixture provider unavailable");
    expect(client.requests).toHaveLength(28);
    const onDisk = JSON.parse(await readFile(join(paths.outputDir, "manifest.json"), "utf8")) as { status: string };
    expect(onDisk.status).toBe("incomplete");
  });

  it("uses bounded historical search for listing passes and fails closed on a per-pass cap", async () => {
    const paths = await fixture();
    const binding = JSON.parse(await readFile(paths.bindingsPath, "utf8")) as Array<{ config: { scanPasses: unknown[] } }>;
    binding[0]!.config.scanPasses[0] = { mode: "listing", listing: "ask", maxItems: 2, requiredKeywords: ["Synthetic"] };
    await writeFile(paths.bindingsPath, JSON.stringify(binding));
    const client = new FakeClient();
    client.overflowQuery = "term-2";
    const manifest = await recoverHnPublicHistoricalDay({ day: "2026-09-20", ...paths, client });
    expect(client.requests[0]?.query).toBe("Synthetic");
    expect(client.requests[0]?.options?.requireComplete).toBe(true);
    expect(manifest.passes[0]?.status).toBe("complete");
    expect(manifest.passes[2]?.status).toBe("incomplete");
    expect(manifest.passes[2]?.warnings.join(" ")).toContain("maxItems exceeded");
    expect(manifest.status).toBe("incomplete");
  });

  it("preserves each complete comment pass's IDs before cross-pass deduplication", async () => {
    const paths = await fixture();
    const binding = JSON.parse(await readFile(paths.bindingsPath, "utf8")) as Array<{ config: { scanPasses: unknown[] } }>;
    binding[0]!.config.scanPasses[24] = { mode: "search", target: "comment", query: "comments-a", maxItems: 2 };
    binding[0]!.config.scanPasses[25] = { mode: "search", target: "comment", query: "comments-b", maxItems: 2 };
    await writeFile(paths.bindingsPath, JSON.stringify(binding));
    const client = new FakeClient();
    client.commentQueries = true;
    const manifest = await recoverHnPublicHistoricalDay({ day: "2026-09-20", ...paths, client });
    expect(manifest.passes[24]?.status).toBe("complete");
    expect(manifest.passes[25]?.status).toBe("complete");
    expect(manifest.passes[24]?.returnedCommentIds).toHaveLength(1);
    expect(manifest.passes[25]?.returnedCommentIds).toHaveLength(2);
    expect(manifest.passes[25]?.returnedCommentIds).toContain(manifest.passes[24]?.returnedCommentIds?.[0]);
  });

  it("marks the final cap as incomplete even when every pass succeeds", async () => {
    const paths = await fixture(1);
    const client = new FakeClient();
    client.unique = true;
    const manifest = await recoverHnPublicHistoricalDay({ day: "2026-09-20", ...paths, client });
    expect(manifest.passes.every((pass) => pass.status === "complete")).toBe(true);
    expect(manifest.uniqueCandidateCount).toBe(28);
    expect(manifest.returnedItemCount).toBe(1);
    expect(manifest.finalCapExceeded).toBe(true);
    expect(manifest.status).toBe("incomplete");
  });

  it("does not call an out-of-window story result complete", async () => {
    const paths = await fixture();
    const client = new FakeClient();
    client.outsideQuery = "term-3";
    const manifest = await recoverHnPublicHistoricalDay({ day: "2026-09-20", ...paths, client });
    expect(manifest.passes[3]?.status).toBe("incomplete");
    expect(manifest.passes[3]?.warnings.join(" ")).toContain("outside the requested UTC window");
    expect(manifest.status).toBe("incomplete");
  });
});
