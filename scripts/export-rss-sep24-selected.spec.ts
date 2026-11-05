import { createHash } from "node:crypto";
import { lstat, mkdtemp, readFile, rm } from "node:fs/promises";
import type * as FsPromises from "node:fs/promises";
// CommonJS object permits a one-call filesystem fault while the real exporter writes actual files.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const filesystem = require("node:fs/promises") as typeof FsPromises;
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { RssClientPort, RssFeedItem, RssReadFeedResult } from
  "@social-monitor/ingestion/adapters/source/rss/rss-client.port";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { readRssSep24OperatorArtifacts } from "./import-rss-sep24-verified";
import { planRssSep24Verified } from "./recover-rss-sep24-verified";
import { exportRssSep24Selected, type SelectedExportRequest } from "./export-rss-sep24-selected";

const feedUrl = "https://example.test/rss";
const bindingId = "00000000-0000-4000-8000-000000000004";
const scope: SelectedExportRequest["scope"] = { tenantId: tenantId("00000000-0000-4000-8000-000000000001"),
  workspaceId: workspaceId("00000000-0000-4000-8000-000000000002"),
  interestId: "00000000-0000-4000-8000-000000000003", sourceBindingId: bindingId,
  scanPolicyId: "00000000-0000-4000-8000-000000000005" };
const extraFeedUrls = Array.from({ length: 24 }, (_, index) => `https://feed-${index + 1}.example.test/rss`);
const binding = { bindingId, status: "ENABLED", config: { extraFeedUrls, feedUrl,
  maxItemAgeHours: 24, maxItems: 30, mode: "url", query: feedUrl } };
const item = (guid = "guid-1", title = "Synthetic article"): RssFeedItem => ({
  guid, link: "https://example.test/posts/1", title, content: "Synthetic public article text",
  publishedAt: new Date("2026-09-24T12:00:00.000Z"),
});
const fake = (result: RssReadFeedResult, calls: string[]): RssClientPort => ({
  readFeed: async (url, limit, options) => {
    calls.push(url);
    expect(limit).toBe(30);
    expect(options?.targetPublishedWindow?.startInclusive.toISOString()).toBe("2026-09-24T00:00:00.000Z");
    return url === feedUrl ? result : { items: [] };
  },
});

describe("Sep24 source-only selected export", () => {
  const parents: string[] = [];
  afterEach(async () => { await Promise.all(parents.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });
  async function request(): Promise<SelectedExportRequest> {
    const parent = await mkdtemp(join(tmpdir(), "rss-sep24-export-test-"));
    parents.push(parent);
    return { outputRoot: join(parent, "new-output"), scope, bindings: [binding] };
  }

  // Regression caught: output from the real RSS normalization path drifts from both operator readers.
  it("writes private canonical files accepted by the plan and pinned-file reader", async () => {
    const input = await request();
    const calls: string[] = [];
    const result = await exportRssSep24Selected(input, fake({ items: [item()] }, calls));
    expect(calls).toEqual([feedUrl, ...extraFeedUrls]);
    expect(result).toMatchObject({ selectedCount: 1, warningCount: 0 });
    const files = ["bindings-sanitized.json", "items.json", "manifest.json", "pins-rss-sep24.json"];
    for (const name of files) expect((await lstat(join(input.outputRoot, name))).mode & 0o077).toBe(0);
    expect((await lstat(input.outputRoot)).mode & 0o077).toBe(0);
    const artifacts = await readRssSep24OperatorArtifacts({ inputRoot: input.outputRoot,
      expectedPinsSha256: result.pinsSha256 }, process.getuid?.() ?? 0);
    const plan = planRssSep24Verified(artifacts);
    expect(plan.candidates.map((candidate) => candidate.externalId)).toEqual(["guid-1"]);
    expect(plan.coverage).toBe("PARTIAL_SOURCE_ONLY");
    expect(JSON.parse(artifacts.bindingBytes.toString("utf8"))).toEqual([binding]);
    expect(JSON.parse(plan.bindingConfig)).toEqual(binding.config);
    const manifest = JSON.parse((await readFile(join(input.outputRoot, "manifest.json"))).toString("utf8")) as
      { sourceStatus: string; scanMode: string };
    expect(manifest).toMatchObject({ sourceStatus: "partial", scanMode: "read_only" });
  });

  // Regression caught: Google News window expansion loses selected feed provenance or exceeds the explicit scan.
  it("keeps bounded Google News window feeds in the verified manifest", async () => {
    const input = await request();
    const newsFeed = "https://news.google.com/rss/search?q=alpha";
    const calls: string[] = [];
    const client: RssClientPort = { readFeed: async (url, limit) => {
      calls.push(url);
      expect(limit).toBe(30);
      return { items: [{ ...item(`guid-${calls.length}`), link: `https://example.test/posts/${calls.length}` }] };
    } };
    const configured = { ...input, bindings: [{ ...binding, config: { ...binding.config, feedUrl: newsFeed,
      query: newsFeed } }] };
    const result = await exportRssSep24Selected(configured, client);
    expect(calls).toHaveLength(25);
    expect(calls[0]).toContain("after%3A2026-09-24");
    expect(calls[0]).toContain("before%3A2026-09-25");
    const artifacts = await readRssSep24OperatorArtifacts({ inputRoot: input.outputRoot,
      expectedPinsSha256: result.pinsSha256 }, process.getuid?.() ?? 0);
    expect(planRssSep24Verified(artifacts).distinctCount).toBe(25);
  });

  // Regression caught: rejecting the real 26-term primary before reads, scanning beyond the first 12 terms,
  // or losing the original binding fingerprint and partial status in the 36-feed, 30-item capture.
  it("scans the first 12 of 26 Google News terms plus 24 extras and pins selected items", async () => {
    const input = await request();
    const terms = "abcdefghijklmnopqrstuvwxyz".split("");
    const primary = new URL("https://news.google.com/rss/search?q=a");
    primary.searchParams.set("q", terms.join(" OR "));
    const newsFeed = primary.toString();
    const expectedFeeds = [...terms.slice(0, 12).map((term) => {
      const historical = new URL(newsFeed);
      historical.searchParams.set("q", `${term} after:2026-09-24 before:2026-09-25`);
      return historical.toString();
    }), ...extraFeedUrls];
    const configuredBinding = { ...binding, config: { ...binding.config, feedUrl: newsFeed, query: newsFeed } };
    const configured = { ...input, bindings: [configuredBinding] };
    const calls: string[] = [];
    const client: RssClientPort = { readFeed: async (url, limit, options) => {
      calls.push(url);
      expect(limit).toBe(30);
      expect(options?.targetPublishedWindow?.startInclusive.toISOString()).toBe("2026-09-24T00:00:00.000Z");
      expect(options?.targetPublishedWindow?.endExclusive.toISOString()).toBe("2026-09-25T00:00:00.000Z");
      const id = calls.length.toString(36);
      return { items: [{ ...item(id, "a"), link: `https://example.test/posts/${id}`, content: "a" }] };
    } };
    const result = await exportRssSep24Selected(configured, client);
    expect(calls).toEqual(expectedFeeds);
    expect(result).toMatchObject({ selectedCount: 30, warningCount: 1 });
    const artifacts = await readRssSep24OperatorArtifacts({ inputRoot: input.outputRoot,
      expectedPinsSha256: result.pinsSha256 }, process.getuid?.() ?? 0);
    const originalBindingBytes = Buffer.from(`${JSON.stringify([configuredBinding], null, 2)}\n`);
    expect(artifacts.bindingBytes).toEqual(originalBindingBytes);
    const fingerprint = createHash("sha256").update(originalBindingBytes).digest("hex");
    expect(artifacts.expectedBindingSha256).toBe(fingerprint);
    const plan = planRssSep24Verified(artifacts);
    expect(plan.bindingSha256).toBe(fingerprint);
    expect(plan.bindingConfig).toBe(JSON.stringify(configuredBinding.config));
    expect(plan.coverage).toBe("PARTIAL_SOURCE_ONLY");
    expect(plan.candidates.map((candidate) => candidate.externalId)).toEqual(
      Array.from({ length: 30 }, (_, index) => (index + 1).toString(36)));
    const manifest = JSON.parse((await readFile(join(input.outputRoot, "manifest.json"))).toString("utf8")) as
      { sourceStatus: string };
    expect(manifest.sourceStatus).toBe("partial");
  });

  // Regression caught: a known skipped entry is misreported as full-day coverage or leaks warning text.
  it("counts known skipped entries while preserving partial source status", async () => {
    const input = await request();
    const result = await exportRssSep24Selected(input, fake({ items: [item(),
      { ...item("guid-undated"), publishedAt: undefined }] }, []));
    expect(result).toMatchObject({ selectedCount: 1, warningCount: 1 });
    const artifacts = await readRssSep24OperatorArtifacts({ inputRoot: input.outputRoot,
      expectedPinsSha256: result.pinsSha256 }, process.getuid?.() ?? 0);
    expect(planRssSep24Verified(artifacts).coverage).toBe("PARTIAL_SOURCE_ONLY");
  });

  it("exports only selected Sep24 items from the bound feeds", async () => {
    const input = await request();
    const client: RssClientPort = { readFeed: async (url, limit, options) => {
      expect(limit).toBe(30);
      expect(options?.targetPublishedWindow?.endExclusive.toISOString()).toBe("2026-09-25T00:00:00.000Z");
      if (url !== extraFeedUrls[0]) return { items: [] };
      return { items: [item("in-window"),
        { ...item("too-early"), publishedAt: new Date("2026-09-23T23:59:59.000Z") },
        { ...item("too-late"), publishedAt: new Date("2026-09-25T00:00:00.000Z") }] };
    } };
    const result = await exportRssSep24Selected(input, client);
    expect(result.selectedCount).toBe(1);
    const artifacts = await readRssSep24OperatorArtifacts({ inputRoot: input.outputRoot,
      expectedPinsSha256: result.pinsSha256 }, process.getuid?.() ?? 0);
    const plan = planRssSep24Verified(artifacts);
    expect(plan.candidates.map((candidate) => candidate.externalId)).toEqual(["in-window"]);
    expect(plan.candidates[0]?.item.metadata?.feedUrl).toBe(extraFeedUrls[0]);
    expect(plan.coverage).toBe("PARTIAL_SOURCE_ONLY");
  });

  // Regression caught: unsafe or ambiguous binding reaches the network before validation.
  it("rejects malformed six-key bindings and fanout before reading", async () => {
    const input = await request();
    const calls: string[] = [];
    const client = fake({ items: [item()] }, calls);
    await expect(exportRssSep24Selected({ ...input, bindings: [{ ...binding,
      config: { ...binding.config, feedUrl: "https://127.0.0.1/rss" } }] }, client)).rejects.toThrow();
    await expect(exportRssSep24Selected({ ...input, bindings: [{ ...binding,
      config: { ...binding.config, extraFeedUrls: [feedUrl] } }] }, client)).rejects.toThrow();
    await expect(exportRssSep24Selected({ ...input, bindings: [binding, binding] }, client)).rejects.toThrow();
    await expect(exportRssSep24Selected({ ...input, scope: { ...scope, interestId: "malformed" } }, client))
      .rejects.toThrow();
    await expect(exportRssSep24Selected({ ...input, bindings: [{ ...binding,
      config: { ...binding.config, mode: "search" } }] }, client)).rejects.toThrow();
    await expect(exportRssSep24Selected({ ...input, bindings: [{ ...binding,
      config: { ...binding.config, query: extraFeedUrls[0] } }] }, client)).rejects.toThrow();
    await expect(exportRssSep24Selected({ ...input, bindings: [{ ...binding,
      config: { ...binding.config, extraFeedUrls: [feedUrl, ...extraFeedUrls.slice(1)] } }] }, client)).rejects.toThrow();
    await expect(exportRssSep24Selected({ ...input, bindings: [{ ...binding,
      config: { ...binding.config, extraFeedUrls: ["https://127.0.0.1/rss", ...extraFeedUrls.slice(1)] } }] }, client))
      .rejects.toThrow();
    await expect(exportRssSep24Selected({ ...input, bindings: [{ ...binding,
      config: { ...binding.config, maxItems: 101 } }] }, client)).rejects.toThrow();
    await expect(exportRssSep24Selected({ ...input, bindings: [{ ...binding,
      config: { ...binding.config, maxItemAgeHours: 745 } }] }, client)).rejects.toThrow();
    const newsFeed = "https://news.google.com/rss/search?q=a+OR+b";
    await expect(exportRssSep24Selected({ ...input, bindings: [{ ...binding,
      config: { ...binding.config, extraFeedUrls: [newsFeed, ...extraFeedUrls.slice(1)] } }] }, client))
      .rejects.toThrow();
    await expect(exportRssSep24Selected({ ...input, bindings: [{ ...binding,
      config: { ...binding.config, feedUrl: newsFeed.replace("a+OR+b", "a+OR+"),
        query: newsFeed.replace("a+OR+b", "a+OR+") } }] }, client)).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  // Regression caught: sanitizer changes a selected provider item but exporter publishes its original bytes.
  it("rejects content that ingestion sanitization would change", async () => {
    const input = await request();
    await expect(exportRssSep24Selected(input, fake({ items: [{ ...item(),
      link: "https://example.test/posts/1#fragment" }] }, [])))
      .rejects.toThrow("sanitization");
    await expect(lstat(input.outputRoot)).rejects.toMatchObject({ code: "ENOENT" });
  });

  // Regression caught: conflicting GUID reuse creates an ambiguous selected-item identity.
  it("rejects conflicting duplicate IDs and missing GUID fallback", async () => {
    const input = await request();
    await expect(exportRssSep24Selected(input, fake({ items: [item(), item("guid-1", "Other article")] }, [])))
      .rejects.toThrow("Conflicting provider ID");
    await expect(exportRssSep24Selected(input, fake({ items: [{ ...item(), guid: undefined }] }, [])))
      .rejects.toThrow("stable GUID");
    await expect(lstat(input.outputRoot)).rejects.toMatchObject({ code: "ENOENT" });
  });

  // Regression caught: truncation is silently treated as complete-day coverage.
  it("pins bounded truncation as partial and never overwrites a completed output", async () => {
    const input = await request();
    const result = await exportRssSep24Selected(input, fake({ items: [item()], truncated: true }, []));
    expect(result).toMatchObject({ selectedCount: 1, warningCount: 1 });
    const artifacts = await readRssSep24OperatorArtifacts({ inputRoot: input.outputRoot,
      expectedPinsSha256: result.pinsSha256 }, process.getuid?.() ?? 0);
    expect(planRssSep24Verified(artifacts).coverage).toBe("PARTIAL_SOURCE_ONLY");
    await expect(exportRssSep24Selected(input, fake({ items: [item()] }, []))).rejects.toThrow();
    expect(planRssSep24Verified(artifacts).selectedCount).toBe(1);
  });

  it("fails closed on an unknown feed failure warning", async () => {
    const input = await request();
    const client: RssClientPort = { readFeed: async (url) => {
      if (url === extraFeedUrls[0]) throw new Error("synthetic read failure");
      return { items: url === feedUrl ? [item()] : [] };
    } };
    await expect(exportRssSep24Selected(input, client)).rejects.toThrow("incomplete");
    await expect(lstat(input.outputRoot)).rejects.toMatchObject({ code: "ENOENT" });
  });

  // Regression caught: failure after writing data files leaves a discoverable pins commit marker.
  it("leaves no pins when publication fails after the first durable file", async () => {
    const input = await request();
    const rename = filesystem.rename;
    const fault = jest.spyOn(filesystem, "rename").mockImplementation(async (from, to) => {
      if (String(to).endsWith("items.json")) throw new Error("synthetic disk failure");
      return rename(from, to);
    });
    try {
      await expect(exportRssSep24Selected(input, fake({ items: [item()] }, [])))
        .rejects.toThrow("synthetic disk failure");
    } finally { fault.mockRestore(); }
    expect((await lstat(join(input.outputRoot, "bindings-sanitized.json"))).isFile()).toBe(true);
    await expect(lstat(join(input.outputRoot, "pins-rss-sep24.json")))
      .rejects.toMatchObject({ code: "ENOENT" });
  });
});
