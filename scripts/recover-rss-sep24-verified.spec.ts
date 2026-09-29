import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { FakeFeedProjection, FakeScanAttemptRepository, FakeScanLease,
  FakeSourceItemRepository, SequenceIdGenerator } from
  "@social-monitor/ingestion/features/execute-scan/execute-scan.use-case.spec-support";
import { FixedClock, type TenantId, type WorkspaceId } from "@social-monitor/shared-kernel";
import { importRssSep24Verified, planRssSep24Verified, RSS_SEP24_JOURNAL,
  type RssSep24Artifacts, type RssSep24Dependencies, type RssSep24Scope,
  type RssSep24WriteDependencies } from "./recover-rss-sep24-verified";

const sha = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");
const json = (value: unknown): Buffer => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const bindingId = "00000000-0000-4000-8000-000000000004";
const feedUrl = "https://example.test/rss";
const scope: RssSep24Scope = { tenantId: "00000000-0000-4000-8000-000000000001" as TenantId,
  workspaceId: "00000000-0000-4000-8000-000000000002" as WorkspaceId,
  interestId: "00000000-0000-4000-8000-000000000003", sourceBindingId: bindingId,
  scanPolicyId: "00000000-0000-4000-8000-000000000005", correlationId: "fixture-rss-sep24" };
const pinnedScope = { tenantId: scope.tenantId, workspaceId: scope.workspaceId,
  interestId: scope.interestId, sourceBindingId: scope.sourceBindingId, scanPolicyId: scope.scanPolicyId };
const item = (id: string, title = "A captured post") => ({ externalId: id,
  canonicalUrl: `https://example.test/posts/${encodeURIComponent(id)}`, title, body: "Captured public text",
  publishedAt: "2026-09-24T12:00:00.000Z", metadata: { kind: "rss_item", feedUrl } });
function fixture(items: readonly ReturnType<typeof item>[] = [item("guid-1"), item("guid-2")]): RssSep24Artifacts {
  const bindingBytes = json([{ bindingId, status: "ENABLED", config: { feedUrl, maxItems: 30,
    targetPublishedWindow: { startInclusive: "2026-09-24T00:00:00.000Z",
      endExclusive: "2026-09-25T00:00:00.000Z" } } }]);
  const itemsBytes = json({ schemaVersion: 1, day: "2026-09-24", items });
  const manifestBytes = json({ schemaVersion: 1, day: "2026-09-24", providerKey: "rss",
    bindingId, bindingSha256: sha(bindingBytes), scope: pinnedScope,
    scanMode: "read_only", sourceStatus: "partial",
    window: { from: "2026-09-24T00:00:00.000Z", to: "2026-09-25T00:00:00.000Z" },
    selectedIds: items.map((entry) => entry.externalId), itemsSha256: sha(itemsBytes) });
  return { pinnedScope, bindingBytes, expectedBindingSha256: sha(bindingBytes), manifestBytes,
    expectedManifestSha256: sha(manifestBytes), itemsBytes, expectedItemsSha256: sha(itemsBytes) };
}
function withItems(artifacts: RssSep24Artifacts, change: (items: Record<string, unknown>[]) => void): RssSep24Artifacts {
  const payload = JSON.parse(artifacts.itemsBytes.toString("utf8")) as { items: Record<string, unknown>[] };
  change(payload.items);
  const itemsBytes = json(payload);
  const manifest = JSON.parse(artifacts.manifestBytes.toString("utf8")) as Record<string, unknown>;
  manifest.itemsSha256 = sha(itemsBytes);
  const manifestBytes = json(manifest);
  return { ...artifacts, itemsBytes, expectedItemsSha256: sha(itemsBytes), manifestBytes,
    expectedManifestSha256: sha(manifestBytes) };
}
function withSecondFeed(artifacts: RssSep24Artifacts, secondFeed: string): RssSep24Artifacts {
  const bindings = JSON.parse(artifacts.bindingBytes.toString("utf8")) as { config: Record<string, unknown> }[];
  bindings[0]!.config.feedUrls = [secondFeed];
  const bindingBytes = json(bindings);
  const manifest = JSON.parse(artifacts.manifestBytes.toString("utf8")) as Record<string, unknown>;
  manifest.bindingSha256 = sha(bindingBytes);
  const manifestBytes = json(manifest);
  return { ...artifacts, bindingBytes, expectedBindingSha256: sha(bindingBytes), manifestBytes,
    expectedManifestSha256: sha(manifestBytes) };
}
function doubles(): { dependencies: RssSep24Dependencies; writes: RssSep24WriteDependencies;
  source: FakeSourceItemRepository; feed: FakeFeedProjection } {
  const source = new FakeSourceItemRepository();
  const feed = new FakeFeedProjection();
  const writes: RssSep24WriteDependencies = { verifyCurrentBinding: async () => true,
    findExistingExternalIds: async (_scope, ids) => source.all().map((entry) => entry.toSnapshot().externalId)
      .filter((id) => ids.includes(id)),
    sourceItems: { saveBatchInsertOnly: (command) => source.saveBatch(command) },
    feedProjection: feed, scanAttempts: new FakeScanAttemptRepository(), scanLeases: new FakeScanLease(),
    ids: new SequenceIdGenerator(), clock: new FixedClock(new Date("2026-09-29T00:00:00.000Z")) };
  return { source, feed, writes, dependencies: { withAtomicWrites: (_scope, _url, _config, work) => work(writes) } };
}

describe("RSS Sep 24 verified importer", () => {
  const roots: string[] = [];
  afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
  async function journal(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "rss-sep24-verified-"));
    roots.push(root);
    return join(root, RSS_SEP24_JOURNAL);
  }

  // Regression: a changed day, scope, or byte pin must never reach a write.
  it("rejects wrong day, scope, and exact hash", async () => {
    const artifacts = fixture();
    expect(() => planRssSep24Verified({ ...artifacts, expectedItemsSha256: "0".repeat(64) })).toThrow("SHA-256 mismatch");
    const changed = withItems(artifacts, (items) => { items[0]!.publishedAt = "2026-09-25T00:00:00.000Z"; });
    expect(() => planRssSep24Verified(changed)).toThrow("outside Sep 24");
    const wrongDay = JSON.parse(artifacts.manifestBytes.toString("utf8")) as Record<string, unknown>;
    wrongDay.day = "2026-09-25";
    const wrongDayBytes = json(wrongDay);
    expect(() => planRssSep24Verified({ ...artifacts, manifestBytes: wrongDayBytes,
      expectedManifestSha256: sha(wrongDayBytes) })).toThrow("Manifest binding/day/source proof mismatch");
    const plan = planRssSep24Verified(artifacts);
    const path = await journal();
    const { dependencies, source } = doubles();
    await expect(importRssSep24Verified({ artifacts, expectedPlanSha256: plan.planSha256,
      journalPath: path, scope: { ...scope, sourceBindingId: "00000000-0000-4000-8000-000000000099" },
      dependencies })).rejects.toThrow("scope/binding mismatch");
    await expect(importRssSep24Verified({ artifacts, expectedPlanSha256: plan.planSha256,
      journalPath: path, scope: { ...scope, tenantId: "00000000-0000-4000-8000-000000000099" as TenantId },
      dependencies })).rejects.toThrow("scope/binding mismatch");
    expect(source.all()).toHaveLength(0);
    await expect(readFile(path)).rejects.toMatchObject({ code: "ENOENT" });
  });

  // Each ID rejection uses a safe canonical URL so the provider-ID guard is exercised.
  it("rejects malformed provider IDs", () => {
    expect(() => planRssSep24Verified(fixture([item("bad id")]))).toThrow("provider ID");
  });

  it("rejects conflicting provider IDs", () => {
    expect(() => planRssSep24Verified(fixture([item("same"), item("same", "Different")]))).toThrow("conflicting content");
  });

  it("rejects unbound feeds and changed adapter content", () => {
    const changed = withItems(fixture(), (items) => {
      items[0]!.metadata = { kind: "rss_item", feedUrl: "https://other.test/rss" };
    });
    expect(() => planRssSep24Verified(changed)).toThrow("unverified RSS adapter metadata");
    const sanitized = withItems(fixture(), (items) => {
      items[0]!.metadata = { kind: "rss_item", feedUrl,
        mediaContentUrl: "https://example.test/image#fragment" };
    });
    expect(() => planRssSep24Verified(sanitized)).toThrow("changed by ingestion sanitization");
    const unreadable = withItems(fixture(), (items) => {
      items[0]!.title = "<script>hidden</script>";
      items[0]!.body = "<style>hidden</style>";
    });
    expect(() => planRssSep24Verified(unreadable)).toThrow("incomplete content");
  });

  it("rejects an unsafe canonical URL", () => {
    const local = withItems(fixture(), (items) => {
      items[0]!.canonicalUrl = "https://127.0.0.1/post";
    });
    expect(() => planRssSep24Verified(local)).toThrow("canonicalUrl is unsafe");
  });

  // Regression: one GUID selected by two configured feeds is one post, even though its feed provenance differs.
  it("accepts matching duplicate content from separate approved feeds", () => {
    const secondFeed = "https://second.example.test/rss";
    const second = { ...item("same"), metadata: { kind: "rss_item", feedUrl: secondFeed } };
    const artifacts = withSecondFeed(fixture([item("same"), second]), secondFeed);
    const plan = planRssSep24Verified(artifacts);
    expect(plan.selectedCount).toBe(2);
    expect(plan.distinctCount).toBe(1);
    expect(plan.candidates[0]?.item.metadata).toMatchObject({ feedUrl });
  });

  // Regression: repeated identical adapter selections count once, and only absent IDs are inserted.
  it("imports a finite deduplicated set, reports counts, and refuses replay", async () => {
    const artifacts = fixture([item("guid-1"), item("guid-1"), item("guid-2")]);
    const plan = planRssSep24Verified(artifacts);
    expect(plan.selectedCount).toBe(3);
    expect(plan.distinctCount).toBe(2);
    const path = await journal();
    const { dependencies, source, feed } = doubles();
    const receipt = await importRssSep24Verified({ artifacts, expectedPlanSha256: plan.planSha256,
      journalPath: path, scope, dependencies });
    expect(receipt).toEqual({ coverage: "PARTIAL_SOURCE_ONLY", planSha256: plan.planSha256,
      inserted: 2, alreadyPresent: 0, postWritePresent: 2 });
    expect(source.all()).toHaveLength(2);
    expect(feed.commands).toHaveLength(1);
    await expect(importRssSep24Verified({ artifacts, expectedPlanSha256: plan.planSha256,
      journalPath: path, scope, dependencies })).rejects.toThrow("Previous RSS journal/replay");
    expect(source.all()).toHaveLength(2);
  });

  // Regression: an existing provider ID is counted from the scoped read and never sent to insert-only persistence.
  it("inserts only the absent item and verifies the full post-write set", async () => {
    const artifacts = fixture();
    const plan = planRssSep24Verified(artifacts);
    const path = await journal();
    const { source, feed, writes } = doubles();
    const existingAware: RssSep24Dependencies = { withAtomicWrites: (_scope, _url, _config, work) => work({ ...writes,
      findExistingExternalIds: async (_scope, ids) => ["guid-1", ...source.all().map((entry) =>
        entry.toSnapshot().externalId)].filter((id) => ids.includes(id)) }) };
    const receipt = await importRssSep24Verified({ artifacts, expectedPlanSha256: plan.planSha256,
      journalPath: path, scope, dependencies: existingAware });
    expect(receipt).toMatchObject({ inserted: 1, alreadyPresent: 1, postWritePresent: 2 });
    expect(source.all().map((entry) => entry.toSnapshot().externalId)).toEqual(["guid-2"]);
    expect(feed.commands).toHaveLength(1);
  });

  // Regression: a failed binding recheck leaves an exclusive started journal for manual reconciliation.
  it("keeps the one-shot journal after uncertainty", async () => {
    const artifacts = fixture();
    const plan = planRssSep24Verified(artifacts);
    const path = await journal();
    const { dependencies, writes } = doubles();
    await expect(importRssSep24Verified({ artifacts, expectedPlanSha256: plan.planSha256,
      journalPath: path, scope, dependencies: { ...dependencies,
        withAtomicWrites: (_scope, _url, _config, work) => work({ ...writes, verifyCurrentBinding: async () => false }) } }))
      .rejects.toThrow("journal remains started");
    expect(JSON.parse((await readFile(path)).toString("utf8"))).toMatchObject({ status: "started" });
    await expect(importRssSep24Verified({ artifacts, expectedPlanSha256: plan.planSha256,
      journalPath: path, scope, dependencies })).rejects.toThrow("Previous RSS journal/replay");
  });

  // Regression: a write acknowledgment cannot complete the journal if the scoped post-write read is short.
  it("leaves the journal started when post-write counts disagree", async () => {
    const artifacts = fixture();
    const plan = planRssSep24Verified(artifacts);
    const path = await journal();
    const { dependencies, writes } = doubles();
    await expect(importRssSep24Verified({ artifacts, expectedPlanSha256: plan.planSha256,
      journalPath: path, scope, dependencies: { ...dependencies,
        withAtomicWrites: (_scope, _url, _config, work) => work({ ...writes, findExistingExternalIds: async () => [] }) } }))
      .rejects.toThrow("Post-write RSS count mismatch");
    expect(JSON.parse((await readFile(path)).toString("utf8"))).toMatchObject({ status: "started" });
  });

  it("keeps journal operations on the opened directory when its pathname is swapped", async () => {
    const artifacts = fixture();
    const plan = planRssSep24Verified(artifacts);
    const path = await journal();
    const moved = `${dirname(path)}-moved`;
    roots.push(moved);
    const { writes } = doubles();
    const dependencies: RssSep24Dependencies = { withAtomicWrites: async (_scope, _url, _config, work) => {
      await rename(dirname(path), moved);
      await mkdir(dirname(path), { mode: 0o700 });
      return work(writes);
    } };
    await expect(importRssSep24Verified({ artifacts, expectedPlanSha256: plan.planSha256,
      journalPath: path, scope, dependencies })).rejects.toThrow("journal directory moved");
    expect(JSON.parse((await readFile(join(moved, RSS_SEP24_JOURNAL))).toString("utf8")))
      .toMatchObject({ status: "started" });
    await expect(readFile(path)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
