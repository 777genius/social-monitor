import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSourceEngagementMetrics } from "../../domain";
import { RefreshRetainedMetricsUseCase } from "./refresh-retained-metrics.use-case";
import { ok, type JsonObject } from "@social-monitor/shared-kernel";
import { fixture, manifest, now, target, scope } from "../../../../scripts/lib/retained-metric-refresh.spec-support";
import { metricRefreshDigest } from "../../../../scripts/lib/retained-metric-refresh-receipts";
import { manifestProblem, refreshBatches } from "./metric-refresh-admission";
import type { RefreshScope, RetainedMetricTarget } from "./refresh-retained-metrics.contracts";

describe("bounded retained metric refresh using canonical projection", () => {
  let root: string;
  let f: ReturnType<typeof fixture>;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), "retained-metrics-")); f = fixture(root); });
  afterEach(() => rmSync(root, { recursive: true, force: true }));
  it("preserves content/metadata/published times and returns stable receipts without refetch", async () => {
    expect(f.usecase()).toBeInstanceOf(RefreshRetainedMetricsUseCase);
    const beforeSource = structuredClone(f.db.rows("sourceItem")[0]);
    const beforeFeed = structuredClone(f.db.rows("feedItem")[0]);
    const beforeFetch = f.fetcher.fetch.getMockImplementation()!;
    f.fetcher.fetch.mockImplementation(async () => {
      expect(JSON.parse(readFileSync(join(root, manifest().evidencePath, "operation.json"), "utf8")).value).toEqual(manifest());
      expect(JSON.parse(readFileSync(join(root, manifest().evidencePath, "batch-0.reserved.json"), "utf8")).value).toBeDefined();
      return beforeFetch();
    });
    const result = await f.usecase().execute(manifest());
    expect(result).toMatchObject({ ok: true, value: [{ status: "refreshed", returned: true,
      observedAt: now, before: { observationCount: 0 }, after: { observedAt: now, observationCount: 1 } }] });
    const source = Object.fromEntries(Object.entries(f.db.rows("sourceItem")[0]!).filter(([key]) => !["metadata", "lastObservedAt"].includes(key)));
    expect(source).toEqual(Object.fromEntries(Object.entries(beforeSource!).filter(([key]) => !["metadata", "lastObservedAt"].includes(key))));
    expect(f.db.rows("sourceItem")[0]?.metadata).toEqual({ kind: "reddit_post", provenance: "retained", subreddit: "sandbox", score: 42, numComments: 9 });
    expect(f.db.rows("feedItem")[0]).toEqual({ ...beforeFeed, providerMetadata: { kind: "reddit_post", provenance: "retained", subreddit: "sandbox", score: 42, numComments: 9 } });
    expect(f.db.rows("cursorCheckpoint")).toEqual([]);
    expect(await f.usecase().execute(manifest())).toEqual(result);
    expect(f.fetcher.fetch).toHaveBeenCalledTimes(1);
    expect(f.db.rows("sourceItemEngagementObservation")).toHaveLength(1);
  });
  it.each(["before_commit", "after_commit", "before_ack"])("resumes %s from preserved observations, without a new fetch", async (point) => {
    const project = f.projection.project.bind(f.projection);
    const spy = jest.spyOn(f.projection, "project");
    if (point !== "before_ack") spy.mockImplementationOnce(async (command) => {
      if (point === "after_commit") await project(command);
      throw new Error("simulated interruption");
    });
    else {
      const install = f.install.getMockImplementation()!;
      f.install.mockImplementationOnce(install).mockImplementationOnce(install).mockImplementationOnce(install)
        .mockRejectedValueOnce(new Error("lost result acknowledgement"));
    }
    const first = await f.usecase().execute(manifest()).catch(() => null);
    if (point !== "before_ack") expect(first).toMatchObject({ ok: true, value: [{ status: "failed" }] });
    expect(await f.receipts.read(`${manifest().evidencePath}/batch-0.observed.json`)).toMatchObject({ observations: [{ observedAt: now, sample: { externalId: target().externalId } }] });
    const resumed = await f.usecase().execute(manifest());
    expect(resumed).toMatchObject({ ok: true, value: [{ status: "refreshed", after: { observationCount: 1 } }] });
    expect(f.fetcher.fetch).toHaveBeenCalledTimes(1);
    expect(f.db.rows("sourceItemEngagementObservation")).toHaveLength(1);
    expect(await f.usecase().execute(manifest())).toEqual(resumed);
  });
  it.each([42, 90])("records real equal/regressing observations honestly after previous score %i", async (previousScore) => {
    const built = buildSourceEngagementMetrics({ providerKey: "reddit", metadata: { kind: "reddit_post", score: previousScore, numComments: 9 } });
    await f.projection.project({ tenantId: scope.tenantId as never, workspaceId: scope.workspaceId as never,
      sourceBindingId: target().sourceBindingId, scanJobId: manifest().operationId, providerKey: "reddit",
      observedAt: new Date("2026-09-05T04:00:00Z"), samples: [{ sourceItemId: target().sourceItemId,
        externalId: target().externalId, publishedAt: new Date(target().publishedAt), metrics: built.metrics!,
        metricsFingerprint: built.metricsFingerprint!, providerMetadataPatch: built.providerMetadataPatch, refreshReadModels: true }] });
    const before = (await f.inventory.read())!;
    const result = await f.usecase().execute(manifest([before]));
    expect(result).toMatchObject({ ok: true, value: [{ status: "refreshed", before: { observationCount: 1 },
      after: { observationCount: 2, observedAt: now, regressionCount: previousScore === 90 ? 1 : 0 } }] });
    expect(f.db.rows("sourceItemEngagementSnapshot")[0]?.score).toBe(42n);
    expect(f.db.rows("sourceItemEngagementObservation").at(-1)?.hasRegression).toBe(previousScore === 90);
  });
  it("never restarts a reserved fetch after a crash or spends a later batch", async () => {
    f.fetcher.fetch.mockRejectedValueOnce(new Error("crash after provider returned, before durable evidence"));
    await expect(f.usecase().execute(manifest())).rejects.toThrow();
    expect(await f.usecase().execute(manifest())).toMatchObject({ ok: true, value: [{ status: "uncertain" }] });
    expect(f.fetcher.fetch).toHaveBeenCalledTimes(1);
    expect(await f.usecase().execute({ ...manifest(), operationId: "00000000-0000-7000-8000-000000006199" })).toEqual({ ok: false, error: "reviewed_manifest_sha_mismatch" });
  });
  it.each<{ metadata?: JsonObject }>([{}, { metadata: { kind: "unknown", score: 5 } }, { metadata: { kind: "reddit_post", score: -2, providerScore: 4 } }])("accounts omission and rejects untrusted payload %j", async (row) => {
    f.fetcher.fetch.mockResolvedValueOnce(ok("metadata" in row ? [{ externalId: target().externalId, returned: true, reason: null, metadata: row.metadata! }] : []));
    const result = await f.usecase().execute(manifest());
    expect(result).toMatchObject({ ok: true, value: [{ status: "metadata" in row ? "failed" : "unavailable" }] });
    expect(f.db.rows("sourceItemEngagementSnapshot")).toEqual([]);
  });
  it("rejects source/config/feed drift before fetch and preserves the original operation", async () => {
    f.inventory.list.mockResolvedValueOnce([{ ...target(), configDigest: "d".repeat(64) }]);
    expect(await f.usecase().execute(manifest())).toEqual({ ok: false, error: "inventory_drift" });
    expect(f.fetcher.fetch).not.toHaveBeenCalled();
    f.inventory.read.mockResolvedValueOnce({ ...target(), identityDigest: "e".repeat(64) });
    expect(await f.usecase().execute(manifest())).toEqual({ ok: false, error: "target_drift" });
    expect(f.fetcher.fetch).not.toHaveBeenCalled();
    expect(await f.receipts.read(`${manifest().evidencePath}/batch-0.reserved.json`)).toBeNull();
    expect(f.db.rows("sourceItemEngagementSnapshot")).toEqual([]);
  });
  it.each<Partial<RetainedMetricTarget> | null>([
    { rejection: "binding_disabled" }, { configDigest: "d".repeat(64) },
    { identityDigest: "e".repeat(64) }, { feedDigest: "f".repeat(64) }, null,
  ])("does not reserve or fetch a later batch invalidated during the first fetch: %j", async (drift) => {
    const second = target({ sourceItemId: "00000000-0000-7000-8000-000000006106",
      sourceBindingId: "00000000-0000-7000-8000-000000006107", externalId: "reddit:t3_def",
      canonicalUrl: "https://www.reddit.com/comments/def" });
    const planned = manifest([target(), second]);
    let currentSecond: RetainedMetricTarget | null = second;
    const inventory = { list: jest.fn(async () => planned.targets),
      read: jest.fn(async (_scope: RefreshScope, id: string) => id === second.sourceItemId ? currentSecond : f.inventory.read()) };
    const fetcher = { fetch: jest.fn(async () => {
      currentSecond = drift === null ? null : { ...second, ...drift };
      return f.fetcher.fetch();
    }) };
    const usecase = new RefreshRetainedMetricsUseCase(inventory, fetcher, f.projection, f.receipts, f.clock, metricRefreshDigest);
    expect(await usecase.execute(planned)).toEqual({ ok: false, error: "target_drift" });
    expect(fetcher.fetch).toHaveBeenCalledTimes(1);
    expect(await f.receipts.read(`${planned.evidencePath}/result-${target().sourceItemId}.json`)).toMatchObject({ status: "refreshed" });
    expect(await f.receipts.read(`${planned.evidencePath}/batch-1.reserved.json`)).toBeNull();
    expect(await f.receipts.read(`${planned.evidencePath}/batch-1.observed.json`)).toBeNull();
    // Restoring admission resumes the same operation; the completed first batch has no new budget.
    currentSecond = second;
    fetcher.fetch.mockResolvedValueOnce(ok([]));
    expect(await usecase.execute(planned)).toMatchObject({ ok: true, value: [{ status: "refreshed" }, { status: "unavailable" }] });
    expect(fetcher.fetch.mock.calls).toEqual([[[target()]], [[second]]]);
    expect(f.db.rows("sourceItemEngagementObservation")).toHaveLength(1);
  });
  it("validates every member of a multi-post batch before its reservation", async () => {
    const second = target({ sourceItemId: "00000000-0000-7000-8000-000000006106", externalId: "reddit:t3_def",
      canonicalUrl: "https://www.reddit.com/comments/def" });
    const planned = manifest([target(), second]);
    const inventory = { list: jest.fn(async () => planned.targets),
      read: jest.fn(async (_scope: RefreshScope, id: string) => id === second.sourceItemId ? { ...second, rejection: "binding_disabled" } : target()) };
    const usecase = new RefreshRetainedMetricsUseCase(inventory, f.fetcher, f.projection, f.receipts, f.clock, metricRefreshDigest);
    expect(await usecase.execute(planned)).toEqual({ ok: false, error: "target_drift" });
    expect(inventory.read.mock.calls).toEqual([[scope, target().sourceItemId], [scope, second.sourceItemId]]);
    expect(f.fetcher.fetch).not.toHaveBeenCalled();
    expect(await f.receipts.read(`${planned.evidencePath}/batch-0.reserved.json`)).toBeNull();
  });
  it("still checks admission after fetch and before projection", async () => {
    const fetch = f.fetcher.fetch.getMockImplementation()!;
    f.fetcher.fetch.mockImplementation(async () => {
      f.inventory.read.mockResolvedValue({ ...target(), rejection: "binding_disabled" });
      return fetch();
    });
    const project = jest.spyOn(f.projection, "project");
    expect(await f.usecase().execute(manifest())).toEqual({ ok: false, error: "target_drift" });
    expect(f.fetcher.fetch).toHaveBeenCalledTimes(1);
    expect(project).not.toHaveBeenCalled();
    expect(await f.receipts.read(`${manifest().evidencePath}/batch-0.observed.json`)).not.toBeNull();
  });
  it("stops all remaining batches on an uncertain reservation without resetting the claim", async () => {
    const second = target({ sourceItemId: "00000000-0000-7000-8000-000000006106",
      sourceBindingId: "00000000-0000-7000-8000-000000006107", externalId: "reddit:t3_def",
      canonicalUrl: "https://www.reddit.com/comments/def" });
    const planned = manifest([target(), second]);
    f.inventory.list.mockResolvedValue(planned.targets as RetainedMetricTarget[]);
    f.fetcher.fetch.mockRejectedValueOnce(new Error("interrupted provider observation"));
    await expect(f.usecase().execute(planned)).rejects.toThrow("interrupted provider observation");
    const reservation = await f.receipts.read(`${planned.evidencePath}/batch-0.reserved.json`);
    f.inventory.read.mockRejectedValue(new Error("must reconcile uncertain fetch first"));
    expect(await f.usecase().execute(planned)).toMatchObject({ ok: true, value: [
      { status: "uncertain", reason: "reserved_without_observation_reconcile_required" },
      { status: "uncertain", reason: "reserved_without_observation_reconcile_required" },
    ] });
    expect(f.fetcher.fetch).toHaveBeenCalledTimes(1);
    expect(await f.receipts.read(`${planned.evidencePath}/batch-0.reserved.json`)).toEqual(reservation);
    expect(await f.receipts.read(`${planned.evidencePath}/batch-1.reserved.json`)).toBeNull();
  });
  it("never lets an old preserved sample overwrite a newer observation", async () => {
    const install = f.install.getMockImplementation()!;
    f.install.mockImplementation(async (operation, path, value) => {
      const installed = await install(operation, path, value);
      if (path.endsWith("observed.json")) {
        const evidence = value as { observations: { sample: Record<string, unknown> }[] };
        const sample = evidence.observations[0]!.sample;
        await f.projection.project({ tenantId: scope.tenantId as never, workspaceId: scope.workspaceId as never,
          sourceBindingId: target().sourceBindingId, scanJobId: manifest().operationId, providerKey: "reddit",
          observedAt: new Date("2026-09-05T13:00:00Z"), samples: [{ ...sample, metrics: { score: 99 }, metricsFingerprint: "newer",
            publishedAt: new Date(target().publishedAt), providerMetadataPatch: { score: 99 } } as never] });
      }
      return installed;
    });
    expect(await f.usecase().execute(manifest())).toMatchObject({ ok: true, value: [{ status: "superseded" }] });
    expect(f.db.rows("sourceItemEngagementSnapshot")[0]?.score).toBe(99n);
  });
});

describe("refresh admission and full retained inventory bounds", () => {
  it.each([
    { ...manifest(), scope: { ...scope, tenantId: "wrong" } },
    { ...manifest(), scope: { ...scope, dates: ["2026-08-29"] } },
    { ...manifest(), scope: { ...scope, endAt: "2026-09-06T00:00:00.000Z" } },
    manifest([target({ rejection: "hidden_deleted" })]), manifest([target({ visibleFeedCount: 1001 })]),
    manifest([target({ externalId: "reddit:t1_abc" })]), manifest([target({ publishedAt: "2026-09-05T13:00:00.000Z" })]),
    manifest([target(), target({ sourceItemId: "other", externalId: "reddit:abc" })]),
    { ...manifest(), evidencePath: "different-output-directory" },
  ])("rejects invalid scope, identity, state, fanout, date or root", (value) => {
    expect(manifestProblem(value, new Date(now))).not.toBeNull();
  });
  it("keeps accepted UTC dates/cutoff at Sep 6 rollover and batches all IDs, including below-floor", () => {
    expect(manifestProblem(manifest(), new Date("2026-09-06T01:00:00Z"))).toBeNull();
    const targets = Array.from({ length: 217 }, (_, i) => target({ externalId: `reddit:t3_a${i}`, sourceItemId: `id-${i}` }));
    expect(refreshBatches(targets).map((batch) => batch.length)).toEqual([100, 100, 17]);
    expect(metricRefreshDigest(targets)).not.toBe(metricRefreshDigest(targets.slice(0, 16)));
  });
});
