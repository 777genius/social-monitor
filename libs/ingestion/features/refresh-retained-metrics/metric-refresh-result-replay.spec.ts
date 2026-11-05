import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { err, ok } from "@social-monitor/shared-kernel";
import { manifest, now, target } from "../../../../scripts/lib/retained-metric-refresh.spec-support";
import { metricRefreshDigest } from "../../../../scripts/lib/retained-metric-refresh-receipts";
import { metricRefreshCells } from "./metric-refresh-report";
import { bindingFixture, earlier, later, observedPath, resultPath, type BatchEvidence } from "./metric-refresh-result-binding.spec-support";
import type { MetricFetchObservation, MetricRefreshOutcome } from "./refresh-retained-metrics.contracts";

describe("writer-produced retained metric terminal replay", () => {
  let root: string, f: ReturnType<typeof bindingFixture>;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), "metric-result-replay-")); f = bindingFixture(root); });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it.each(["provider_429_no_retry", "provider_fetch_failed_no_retry", "invalid_metrics", "provider_identity_mismatch", ""])("replays batch failure %j without refetch", async (failure) => {
    f.fetcher.fetch.mockResolvedValueOnce(err(failure));
    expect(await f.usecase().execute(manifest())).toMatchObject({ ok: true, value: [{ status: "failed", returned: false, reason: failure, observedAt: null }] });
    expect(await f.receipts.read(observedPath)).toEqual({ failure, observations: [] });
    await f.assertReplay();
    expect(f.fetcher.fetch).toHaveBeenCalledTimes(1); expect(f.project).not.toHaveBeenCalled();
  });

  it.each<[string, Omit<MetricFetchObservation, "externalId"> | null, string, string, boolean]>([
    ["omission", null, "unavailable", "omitted", false],
    ["explicit null/dead reason", { returned: false, reason: "null_dead_deleted", metadata: null }, "unavailable", "null_dead_deleted", false],
    ["removed identity", { returned: true, reason: "removed_deleted_or_hidden", metadata: null }, "unavailable", "removed_deleted_or_hidden", true],
    ["unknown kind", { returned: true, reason: null, metadata: { kind: "unknown", score: 5 } }, "failed", "invalid_metrics", true],
    ["missing counters", { returned: true, reason: null, metadata: { kind: "reddit_post" } }, "failed", "invalid_metrics", true],
    ["invalid counter", { returned: true, reason: null, metadata: { kind: "reddit_post", score: 5, numComments: -1 } }, "failed", "invalid_metrics", true],
    ["conflicting aliases", { returned: true, reason: null, metadata: { kind: "reddit_post", score: 5, providerScore: 9 } }, "failed", "invalid_metrics", true],
    ["explicit invalid reason without metadata", { returned: false, reason: "invalid_metrics", metadata: null }, "failed", "invalid_metrics", false],
    ["explicit reason overrides invalid data", { returned: true, reason: "provider_unavailable", metadata: { kind: "unknown" } }, "unavailable", "provider_unavailable", true],
    ["empty explicit reason", { returned: false, reason: "", metadata: null }, "unavailable", "", false],
    ["null reason defaults for missing metadata", { returned: true, reason: null, metadata: null }, "unavailable", "omitted", true],
  ])("replays normalized %s using writer reason/status semantics", async (_name, observation, status, reason, returned) => {
    f.fetcher.fetch.mockResolvedValueOnce(ok(observation ? [{ externalId: target().externalId, ...observation }] : []));
    expect(await f.usecase().execute(manifest())).toMatchObject({ ok: true, value: [{ status, reason, returned, observedAt: now }] });
    expect(await f.receipts.read(observedPath)).toMatchObject({ failure: null, observations: [{ sample: null, reason, returned }] });
    await f.assertReplay();
    expect(f.fetcher.fetch).toHaveBeenCalledTimes(1); expect(f.project).not.toHaveBeenCalled();
  });

  it.each<[boolean, string | null]>([[true, null], [false, null], [true, "invalid_metrics"], [false, "provider_annotation"], [true, ""]])(
    "replays a valid sample with preserved returned=%s reason=%j", async (returned, reason) => {
      f.fetcher.fetch.mockResolvedValueOnce(ok([{ externalId: target().externalId, returned, reason,
        metadata: { kind: "reddit_post", score: -2, numComments: 9, upvoteRatio: 0.75 } }]));
      expect(await f.usecase().execute(manifest())).toMatchObject({ ok: true, value: [{ status: "refreshed", reason, returned }] });
      await f.assertReplay();
      expect(f.fetcher.fetch).toHaveBeenCalledTimes(1); expect(f.project).toHaveBeenCalledTimes(1);
      expect(f.db.rows("sourceItemEngagementSnapshot")[0]?.score).toBe(-2n);
    });

  it.each(["refreshed", "superseded", "unavailable", "failed"] as const)("preserves historical sequence-zero %s receipts without manifestSha", async (status) => {
    if (status === "unavailable") f.fetcher.fetch.mockResolvedValueOnce(ok([]));
    if (status === "failed") f.fetcher.fetch.mockResolvedValueOnce(err("provider_fetch_failed_no_retry"));
    if (status === "superseded") await f.projectNatural();
    const row = await f.captureTerminal();
    expect(row.status).toBe(status);
    delete row.manifestSha;
    await f.receipts.install(resultPath, row);
    await f.assertReplay();
  });

  it.each(["unavailable", "invalid_metrics", "batch_failure"] as const)("allows natural ingestion to change current authority for %s", async (kind) => {
    f.fetcher.fetch.mockImplementation(async () => {
      await f.projectNatural();
      if (kind === "batch_failure") return err("provider_fetch_failed_no_retry");
      if (kind === "unavailable") return ok([]);
      return ok([{ externalId: target().externalId, returned: true,
        reason: null, metadata: { kind: "reddit_post", numComments: -1 } }]);
    });
    const result = await f.usecase().execute(manifest());
    expect(result).toMatchObject({ ok: true, value: [{ status: kind === "unavailable" ? "unavailable" : "failed",
      before: { metricsHash: null, observedAt: null }, after: { observedAt: later, observationCount: 1 } }] });
    const row = await f.assertReplay();
    expect(row.after).not.toEqual(row.before); expect(row.after.metricsHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(f.project).toHaveBeenCalledTimes(1); expect(f.fetcher.fetch).toHaveBeenCalledTimes(1);
  });

  it("replays superseded with a strictly newer canonical hash, and never overwrites that authority", async () => {
    await f.projectNatural();
    expect(await f.usecase().execute(manifest())).toMatchObject({ ok: true, value: [{ status: "superseded", observedAt: now, after: { observedAt: later } }] });
    const row = await f.assertReplay();
    const evidence = await f.receipts.read<BatchEvidence>(observedPath);
    expect(row.after.metricsHash).not.toEqual(evidence!.observations[0]!.sample!.metricsFingerprint);
    expect(f.db.rows("sourceItemEngagementSnapshot")[0]?.score).toBe(99n);
    expect(f.db.rows("sourceItemEngagementObservation")).toHaveLength(1);
    expect(f.fetcher.fetch).toHaveBeenCalledTimes(1);
  });

  it("replays a newer equal-metric snapshot as superseded", async () => {
    await f.projectNatural(later, 42);
    expect(await f.usecase().execute(manifest())).toMatchObject({ ok: true, value: [{ status: "superseded" }] });
    const row = await f.assertReplay();
    const batch = await f.receipts.read<BatchEvidence>(observedPath);
    expect(row.after.metricsHash).toEqual(batch!.observations[0]!.sample!.metricsFingerprint);
  });

  it("does not require a cadence append or after.observationAt to equal the sample time", async () => {
    await f.projectNatural("2026-09-05T11:59:00.000Z", 42);
    const before = await f.inventory.read();
    const planned = manifest([before]);
    expect(await f.usecase().execute(planned)).toMatchObject({ ok: true, value: [{ status: "refreshed",
      before: { observationCount: 1 }, after: { observedAt: now, observationAt: "2026-09-05T11:59:00.000Z", observationCount: 1 } }] });
    await f.assertReplay(planned);
  });

  it.each(["before_commit", "after_commit"])("keeps projection failure %s nonterminal and resumes the exact sample without refetch", async (point) => {
    const project = f.project.getMockImplementation()!.bind(f.projection);
    f.project.mockImplementationOnce(async (command) => {
      if (point === "after_commit") await project(command);
      throw new Error("lost acknowledgement");
    });
    expect(await f.usecase().execute(manifest())).toMatchObject({ ok: true, value: [{ status: "failed", reason: "projection_unacknowledged_resume_same_operation" }] });
    expect(await f.receipts.read(resultPath)).toBeNull();
    expect(f.db.rows("sourceItemEngagementObservation")).toHaveLength(point === "after_commit" ? 1 : 0);
    const evidence = await f.receipts.read<BatchEvidence>(observedPath);
    expect(await f.usecase().execute(manifest())).toMatchObject({ ok: true, value: [{ status: "refreshed" }] });
    expect(f.project.mock.calls[1]).toEqual(f.project.mock.calls[0]);
    expect(await f.receipts.read(observedPath)).toEqual(evidence);
    expect(f.db.rows("sourceItemEngagementObservation")).toHaveLength(1);
    expect(f.fetcher.fetch).toHaveBeenCalledTimes(1);
    await f.assertReplay();
  });

  it("keeps valid final accounting replayable with results enumerated before batches", async () => {
    const result = await f.usecase().execute(manifest());
    if (!result.ok) throw new Error(result.error);
    await f.receipts.install(`${manifest().evidencePath}/final.json`, { manifestSha: metricRefreshDigest(manifest()),
      results: result.value, cells: metricRefreshCells(result.value, manifest().scope.dates) });
    await f.assertReplay(manifest(), true);
  });

  it.each([false, true])("binds mixed results by target identity with reversed observations/entries (forged=%s)", async (forged) => {
    const second = target({ sourceItemId: "00000000-0000-7000-8000-000000006106", externalId: "reddit:t3_def",
      canonicalUrl: "https://www.reddit.com/comments/def" });
    const planned = manifest([target(), second]);
    f.inventory.list.mockResolvedValue([...planned.targets]);
    const read = f.inventory.read.getMockImplementation()!;
    // The base fixture has one real projected target; the second has no sample.
    f.inventory.read.mockImplementation(async (...args: unknown[]) => args[1] === second.sourceItemId ? second : read());
    const fetch = f.fetcher.fetch.getMockImplementation()!;
    f.fetcher.fetch.mockImplementation(async () => {
      const result = await fetch();
      if (!result.ok) return result;
      return ok([{ externalId: second.externalId, returned: false, reason: "omitted", metadata: null }, ...result.value]);
    });
    const install = f.install.getMockImplementation()!;
    f.install.mockImplementation(async (operation, path, value) => {
      if (path === observedPath) {
        const batch = value as BatchEvidence;
        value = { ...batch, observations: [...batch.observations].reverse() };
      }
      if (forged && path === resultPath) value = { ...value as MetricRefreshOutcome, returned: false, reason: "omitted" };
      return install(operation, path, value);
    });
    expect(await f.usecase().execute(planned)).toMatchObject({ ok: true, value: [{ status: "refreshed" }, { status: "unavailable" }] });
    if (forged) await f.rejectBeforeEffects("result_observation_mismatch", planned, true);
    else {
      expect(await f.usecaseWithOrder().execute(planned)).toMatchObject({ ok: true, value: [{ sourceItemId: target().sourceItemId,
        status: "refreshed", returned: true, reason: null }, { sourceItemId: second.sourceItemId, status: "unavailable", returned: false, reason: "omitted" }] });
      expect(f.fetcher.fetch).toHaveBeenCalledTimes(1); expect(f.project).toHaveBeenCalledTimes(1);
    }
  });

  it("rejects equal-time different-hash projection as unconfirmed and leaves no terminal receipt", async () => {
    await f.projectNatural(now, 99);
    expect(await f.usecase().execute(manifest())).toEqual({ ok: false, error: "projection_not_confirmed" });
    expect(await f.receipts.read(resultPath)).toBeNull();
    expect(await f.usecase().execute(manifest())).toEqual({ ok: false, error: "projection_not_confirmed" });
    expect(f.fetcher.fetch).toHaveBeenCalledTimes(1);
  });

  it("allows observation history counts to differ from snapshot freshness after retention", async () => {
    await f.projectNatural(earlier, 42);
    f.db.rows("sourceItemEngagementObservation").splice(0);
    const planned = manifest([await f.inventory.read()]);
    expect(await f.usecase().execute(planned)).toMatchObject({ ok: true, value: [{ status: "refreshed", after: { observationCount: 0 } }] });
    await f.assertReplay(planned);
  });

  it("rebuilds and replays a Hacker News sample under its own target provider", async () => {
    const hn = target({ providerKey: "hacker-news", externalId: "hn:49580353", canonicalUrl: "https://news.ycombinator.com/item?id=49580353" });
    const metadata = { kind: "hacker_news_story", points: 42, comments: 9 };
    Object.assign(f.db.rows("sourceItem")[0]!, { providerKey: hn.providerKey, providerItemId: hn.externalId, canonicalUrl: hn.canonicalUrl, metadata });
    Object.assign(f.db.rows("feedItem")[0]!, { providerKey: hn.providerKey, providerItemId: hn.externalId, canonicalUrl: hn.canonicalUrl, providerMetadata: metadata });
    f.inventory.list.mockResolvedValue([hn]);
    const read = f.inventory.read.getMockImplementation()!;
    f.inventory.read.mockImplementation(async () => ({ ...hn, authority: (await read()).authority }));
    f.fetcher.fetch.mockResolvedValueOnce(ok([{ externalId: hn.externalId, returned: true, reason: null, metadata }]));
    const planned = manifest([hn]);
    expect(await f.usecase().execute(planned)).toMatchObject({ ok: true, value: [{ status: "refreshed", providerKey: hn.providerKey }] });
    await f.assertReplay(planned);
    expect(f.fetcher.fetch).toHaveBeenCalledTimes(1); expect(f.project).toHaveBeenCalledTimes(1);
  });
});
