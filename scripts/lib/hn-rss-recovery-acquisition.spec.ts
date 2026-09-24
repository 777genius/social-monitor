import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { IsolatedScanCursorRepository } from "@social-monitor/ingestion/adapters/persistence/isolated-scan-cursor.repository";
import { InMemoryFeedItemReadRepository } from "@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository";
import { InMemoryFeedProjectionAdapter } from "../../apps/ingestion-worker/src/adapters/feed/in-memory-feed-projection.adapter";
import { HackerNewsSourceProvider } from "@social-monitor/ingestion/adapters/source/hacker-news/hacker-news-source.provider";
import type { HackerNewsClientPort, HackerNewsSearchOptions, HackerNewsStory } from "@social-monitor/ingestion/adapters/source/hacker-news/hacker-news-client.port";
import { InMemorySourceProviderRegistry } from "@social-monitor/ingestion/adapters/source/in-memory-source-provider.registry";
import { RegistrySourceFetcherAdapter } from "@social-monitor/ingestion/adapters/source/registry-source-fetcher.adapter";
import { RssSourceProvider } from "@social-monitor/ingestion/adapters/source/rss/rss-source.provider";
import type { RssClientPort } from "@social-monitor/ingestion/adapters/source/rss/rss-client.port";
import { ExecuteScanUseCase } from "@social-monitor/ingestion/features/execute-scan/execute-scan.use-case";
import { FixedClock, tenantId, workspaceId } from "@social-monitor/shared-kernel";
import type { PrismaIngestionWorkerConnection } from "../../apps/ingestion-worker/src/adapters/persistence/prisma-ingestion-worker-connection";

import {
  FakeScanAttemptRepository, FakeScanExecutionReporter,
  FakeScanFailureQueue, FakeScanLease, FakeSourceItemRepository, SequenceIdGenerator,
} from "../../libs/ingestion/features/execute-scan/execute-scan.use-case.spec-support";
import { CleanRealDaySourceConfigReader } from "./clean-real-day-source-config-reader";
import { executeRecoveryAcquisition, requireCompleteRecoveryScan, validateRecoveryWindow, type RecoveryBinding } from "./hn-rss-recovery-acquisition";
import { parseRecoveryArgs } from "./hn-rss-recovery-plan";
import { runRecovery } from "../run-hn-rss-recovery";

const tenant = "00000000-0000-7000-8000-000000000301";
const workspace = "00000000-0000-7000-8000-000000000302";
const bindingId = "00000000-0000-7000-8000-000000000303";
const policyId = "00000000-0000-7000-8000-000000000304";
const interestId = "00000000-0000-7000-8000-000000000305";
const observed = new Date("2026-09-24T00:30:00.000Z");

class SyntheticHnClient implements HackerNewsClientPort {
  readonly calls: { query: string; limit: number; options?: HackerNewsSearchOptions }[] = [];
  async searchStories(query: string, limit: number, options?: HackerNewsSearchOptions): Promise<readonly HackerNewsStory[]> {
    this.calls.push({ query, limit, options });
    const stories: readonly HackerNewsStory[] = [
      { id: 12345, kind: "story", title: "Synthetic HN item", url: "https://example.test/hn/12345", by: "synthetic", time: Date.parse("2026-09-23T16:45:00Z") / 1000, score: 4 },
      { id: 12346, kind: "story", title: "Outside synthetic window", url: "https://example.test/hn/12346", by: "synthetic", time: Date.parse("2026-09-23T19:00:00Z") / 1000, score: 4 },
    ];
    return stories.filter((story) =>
      (options?.from === undefined || (story.time ?? 0) * 1000 >= options.from.getTime()) &&
      (options?.to === undefined || (story.time ?? 0) * 1000 < options.to.getTime()),
    ).slice(0, limit);
  }
  async searchComments(): Promise<readonly HackerNewsStory[]> { return []; }
  async getStory(): Promise<HackerNewsStory | null> { return null; }
  async listStoryComments(): Promise<readonly HackerNewsStory[]> { return []; }
  async listStories(): Promise<readonly HackerNewsStory[]> { throw new Error("Historical recovery must not use live listings"); }
}

describe("HN/RSS recovery injected acquisition path", () => {
  let directory: string;
  beforeEach(() => { directory = mkdtempSync(join(tmpdir(), "hn-rss-acq-test-")); });
  afterEach(() => { rmSync(directory, { recursive: true, force: true }); });

  it("uses bounded HN search, canonical ids, isolated per-run cursors and overlap dedupe", async () => {
    const clock = new FixedClock(observed);
    const hn = new SyntheticHnClient();
    const sourceItems = new FakeSourceItemRepository();
    const feedItems = new InMemoryFeedItemReadRepository();
    const feed = new InMemoryFeedProjectionAdapter(feedItems);
    const attempts = new FakeScanAttemptRepository();
    const reporter = new FakeScanExecutionReporter();
    const scanJobs: string[] = [];
    const config = { mode: "search", query: "synthetic", maxItems: 10 };
    const binding = { interestId, scanPolicyId: policyId, interestQuery: "synthetic", config };
    const deps = {
      readBinding: async () => binding,
      acquire: async (request: ReturnType<typeof parseRecoveryArgs>, _binding: RecoveryBinding, identity: { runId: string; attemptId: string; scanJobId: string }) => {
        scanJobs.push(identity.scanJobId);
        const cursor = new IsolatedScanCursorRepository({ tenantId: tenantId(tenant), workspaceId: workspaceId(workspace), sourceBindingId: bindingId });
        expect(await cursor.findBySourceBinding({ tenantId: tenantId(tenant), workspaceId: workspaceId(workspace), sourceBindingId: bindingId })).toBeNull();
        await expect(cursor.findBySourceBinding({ tenantId: tenantId(tenant), workspaceId: workspaceId(workspace), sourceBindingId: "other-binding" })).rejects.toThrow("scope mismatch");
        const provider = new HackerNewsSourceProvider(hn, clock);
        const fetcher = new RegistrySourceFetcherAdapter(
          new InMemorySourceProviderRegistry([provider], []),
          new CleanRealDaySourceConfigReader([{ sourceBindingId: bindingId, config: { ...config, targetPublishedWindow: { startInclusive: request.from, endExclusive: request.to } } }]),
        );
        const scan = new ExecuteScanUseCase(fetcher, sourceItems, feed, attempts, cursor, reporter, new FakeScanFailureQueue(), new FakeScanLease(), new SequenceIdGenerator(), clock);
        const result = await scan.execute({
          tenantId: tenantId(tenant), workspaceId: workspaceId(workspace), scanJobId: identity.scanJobId,
          interestId, sourceBindingId: bindingId, scanPolicyId: policyId,
          providerKey: "hacker-news", sourceQuery: { mode: "search", query: "synthetic" },
          correlationId: identity.runId, causationId: identity.attemptId, retryBudget: 0,
        });
        if (!result.ok) throw result.error;
        expect(result.value.warnings).toEqual([]);
        return { fetched: result.value.fetched, inserted: result.value.inserted, projected: result.value.projected, skippedDuplicates: result.value.skippedDuplicates, warningCount: result.value.warnings.length };
      },
    };
    const execute = async (from: string, to: string) => {
      const argv = ["--tenant-id", tenant, "--workspace-id", workspace, "--source-binding-id", bindingId, "--provider", "hacker-news", "--from", from, "--to", to, "--journal-dir", directory];
      const request = parseRecoveryArgs(argv, observed);
      const plan = await runRecovery(request, deps);
      return runRecovery(parseRecoveryArgs([...argv, "--apply", "--plan-sha256", String(plan.planSha256)], observed), deps);
    };
    const first = await execute("2026-09-23T16:00:00.000Z", "2026-09-23T17:00:00.000Z");
    const second = await execute("2026-09-23T16:30:00.000Z", "2026-09-23T17:30:00.000Z");
    expect(first.inserted).toBe(1);
    expect(second.inserted).toBe(0);
    expect(sourceItems.all().map((item) => item.toSnapshot().externalId)).toEqual(["hn:12345"]);
    expect(sourceItems.all()[0]?.toSnapshot().ingestedAt).toEqual(observed);
    expect(feedItems.all()).toHaveLength(1);
    expect(feedItems.all()[0]?.toSnapshot().sourceItemId).toBe(sourceItems.all()[0]?.toSnapshot().id);
    expect(scanJobs).toHaveLength(2);
    expect(new Set(scanJobs).size).toBe(2);
    expect(hn.calls).toHaveLength(2);
    expect(hn.calls[0]?.options?.from).toEqual(new Date("2026-09-23T16:00:00.000Z"));
    expect(hn.calls[0]?.options?.to).toEqual(new Date("2026-09-23T17:00:00.000Z"));
  });

  it("retains only dated RSS entries and keeps provider GUID identity", async () => {
    const rssClient: RssClientPort = {
      readFeed: async () => ({ items: [
        { guid: "synthetic-guid-1", link: "https://example.test/rss/1", title: "Synthetic RSS", publishedAt: new Date("2026-09-23T16:45:00Z") },
        { guid: "synthetic-guid-2", link: "https://example.test/rss/2", title: "Out of window", publishedAt: new Date("2026-09-23T18:00:00Z") },
      ] }),
    };
    const provider = new RssSourceProvider(rssClient);
    const result = await provider.scan({ query: { mode: "url", query: "https://example.test/feed.xml" }, maxItems: 10 }, {
      tenantId: tenantId(tenant), workspaceId: workspaceId(workspace), sourceBindingId: bindingId,
      scanJobId: "synthetic", correlationId: "synthetic",
      config: { targetPublishedWindow: { startInclusive: "2026-09-23T16:00:00.000Z", endExclusive: "2026-09-23T17:00:00.000Z" } },
    });
    expect(result.items.map((item) => item.externalId)).toEqual(["synthetic-guid-1"]);
  });

  it("refuses partial HN pass and RSS feed results", async () => {
    const hnClient = new SyntheticHnClient();
    const search = hnClient.searchStories.bind(hnClient);
    hnClient.searchStories = async (query, limit, options) => {
      if (query === "synthetic-fail") throw new Error("synthetic provider failure");
      return search(query, limit, options);
    };
    const hn = requireCompleteRecoveryScan(new HackerNewsSourceProvider(hnClient, new FixedClock(observed)));
    const context = {
      tenantId: tenantId(tenant), workspaceId: workspaceId(workspace), sourceBindingId: bindingId,
      scanJobId: "synthetic", correlationId: "synthetic",
      config: { targetPublishedWindow: { startInclusive: "2026-09-23T16:00:00.000Z", endExclusive: "2026-09-23T17:00:00.000Z" }, scanPasses: [
        { mode: "search", target: "story", query: "synthetic-fail" },
        { mode: "search", target: "story", query: "synthetic" },
      ] },
    };
    await expect(hn.scan(hn.planScan({ mode: "search", query: "synthetic" }, context), context)).rejects.toThrow("partial acquisition");
    const rss = requireCompleteRecoveryScan(new RssSourceProvider({
      readFeed: async (url) => {
        if (url.includes("failed")) throw new Error("synthetic feed failure");
        return { items: [] };
      },
    }));
    const rssContext = { ...context, config: { ...context.config, feedUrls: ["https://example.test/failed.xml"] } };
    await expect(rss.scan(rss.planScan({ mode: "url", query: "https://example.test/feed.xml" }, rssContext), rssContext)).rejects.toThrow("partial acquisition");
  });

  it("rejects every provider warning, including enrichment and root degradation", async () => {
    const provider = new HackerNewsSourceProvider(new SyntheticHnClient(), new FixedClock(observed));
    for (const warning of ["comment enrichment degraded", "missing root", "root lookup degraded"]) {
      const wrapped = requireCompleteRecoveryScan({
        key: () => provider.key(), capabilityProfile: () => provider.capabilityProfile(),
        validateBinding: (query) => provider.validateBinding(query),
        planScan: (query, context) => provider.planScan(query, context),
        classifyError: (error) => provider.classifyError(error),
        scan: async () => ({ items: [], warnings: [warning] }),
      });
      const context = { tenantId: tenantId(tenant), workspaceId: workspaceId(workspace), sourceBindingId: bindingId, scanJobId: "synthetic", correlationId: "synthetic", config: {} };
      await expect(wrapped.scan(wrapped.planScan({ mode: "search", query: "synthetic" }, context), context)).rejects.toThrow("partial acquisition");
    }
  });

  it("bounds base and expanded RSS reads before the provider is called", () => {
    const normal = "https://example.test/feed.xml";
    const google = (terms: number) => `https://news.google.com/rss/search?q=${Array.from({ length: terms }, (_, index) => `term${index}`).join("%20OR%20")}`;
    const dayStart = "2026-09-23T00:00:00.000Z";
    const dayEnd = "2026-09-24T00:00:00.000Z";
    expect(() => validateRecoveryWindow("rss", { feedUrl: normal, extraFeedUrls: Array.from({ length: 11 }, (_, index) => `https://example.test/${index}.xml`) }, dayStart, dayEnd, observed)).not.toThrow();
    expect(() => validateRecoveryWindow("rss", { feedUrl: normal, extraFeedUrls: Array.from({ length: 12 }, (_, index) => `https://example.test/${index}.xml`) }, dayStart, dayEnd, observed)).toThrow("exceed 12");
    expect(() => validateRecoveryWindow("rss", { feedUrl: google(12) }, dayStart, dayEnd, observed)).not.toThrow();
    expect(() => validateRecoveryWindow("rss", { feedUrl: google(13) }, dayStart, dayEnd, observed)).toThrow("exceed 12");
    expect(() => validateRecoveryWindow("rss", { feedUrl: google(12), extraFeedUrls: [normal] }, dayStart, dayEnd, observed)).toThrow("exceed 12");
    expect(() => validateRecoveryWindow("rss", { feedUrl: google(1) }, "2026-09-23T16:00:00.000Z", "2026-09-23T17:00:00.000Z", observed)).toThrow("full UTC day");
    expect(() => validateRecoveryWindow("rss", { feedUrl: normal }, "2026-09-23T16:00:00.000Z", "2026-09-23T17:00:00.000Z", observed)).not.toThrow();
  });

  it("rejects invalid RSS acquisition windows before an injected provider effect", async () => {
    let readCalls = 0;
    const provider = new RssSourceProvider({ readFeed: async () => { readCalls += 1; return { items: [] }; } });
    const base = {
      connection: {} as unknown as PrismaIngestionWorkerConnection,
      tenantId: tenant, workspaceId: workspace, sourceBindingId: bindingId,
      providerKey: "rss" as const, runId: "synthetic-run", attemptId: "synthetic-attempt",
      scanJobId: "00000000-0000-7000-8000-000000000399", provider,
    };
    const feedUrl = `https://news.google.com/rss/search?q=${Array.from({ length: 13 }, (_, index) => `term${index}`).join("%20OR%20")}`;
    await expect(executeRecoveryAcquisition({ ...base, from: "2026-09-23T00:00:00.000Z",
      to: "2026-09-24T00:00:00.000Z", binding: { interestId, scanPolicyId: policyId, interestQuery: "synthetic", config: {
        feedUrl: "https://example.test/feed.xml",
        extraFeedUrls: Array.from({ length: 12 }, (_, index) => `https://example.test/${index}.xml`),
      } } }))
      .rejects.toThrow("exceed 12");
    await expect(executeRecoveryAcquisition({ ...base, from: "2026-09-23T00:00:00.000Z",
      to: "2026-09-24T00:00:00.000Z", binding: { interestId, scanPolicyId: policyId, interestQuery: "synthetic", config: { feedUrl } } }))
      .rejects.toThrow("exceed 12");
    await expect(executeRecoveryAcquisition({ ...base, from: "2026-09-23T16:00:00.000Z",
      to: "2026-09-23T17:00:00.000Z", binding: { interestId, scanPolicyId: policyId, interestQuery: "synthetic", config: { feedUrl } } }))
      .rejects.toThrow("full UTC day");
    expect(readCalls).toBe(0);
  });
});
