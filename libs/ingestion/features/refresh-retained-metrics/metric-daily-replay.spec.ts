import { err, ok } from "@social-monitor/shared-kernel";
import { dailyFixture, dailyGrant } from "../../../../scripts/lib/retained-metric-daily.spec-support";
import { implementation } from "../../../../scripts/lib/retained-metric-renewal.spec-support";
import type { RetainedMetricFetchCapability } from "./refresh-retained-metrics.contracts";
import { refreshBatches } from "./metric-refresh-admission";

jest.setTimeout(180_000);
it("spends deterministic batches once, binds exact final results, and terminal replay reads no inventory", async () => {
  const f = await dailyFixture();
  const prepared = await f.usecase().prepare(implementation);
  if (!prepared.ok) throw new Error(prepared.error.detail);
  const sha = f.hash(prepared.value), old = f.hash([...f.prior.values]), spent = f.hash([...f.renewal.values]);
  expect(await f.usecase().execute("f".repeat(64))).toMatchObject({ ok: false });
  expect(f.fetcher.fetch).not.toHaveBeenCalled();
  f.fetcher.fetch.mockImplementationOnce(async () => err("known_provider_refusal"));
  const done = await f.usecase().execute(sha);
  expect(done).toMatchObject({ ok: true, value: { results: expect.any(Array) } });
  expect(done).toMatchObject({ ok: true, value: { results: expect.arrayContaining([expect.objectContaining({ status: "failed" }), expect.objectContaining({ status: "unavailable" })]) } });
  const batches = refreshBatches(prepared.value.targets);
  expect(f.fetcher.fetch.mock.calls.map((c) => c[0].map((t) => t.sourceItemId))).toEqual(batches.map((b) => b.map((t) => t.sourceItemId)));
  expect([...f.daily.values.keys()].filter((p) => p.endsWith('.reserved.json'))).toHaveLength(batches.length);
  const frozen = f.hash([...f.daily.values]);
  f.inventory.list.mockClear(); f.inventory.read.mockClear(); f.fetcher.fetch.mockClear(); f.setCurrent([]);
  expect(await f.usecase().execute(sha)).toEqual(done);
  expect(f.inventory.list).not.toHaveBeenCalled(); expect(f.inventory.read).not.toHaveBeenCalled(); expect(f.fetcher.fetch).not.toHaveBeenCalled();
  expect(f.hash([...f.daily.values])).toBe(frozen); expect(f.hash([...f.prior.values])).toBe(old); expect(f.hash([...f.renewal.values])).toBe(spent);
  const finalPath = `${dailyGrant.evidencePath}/final.json`;
  const final = f.daily.values.get(finalPath) as { results: unknown[] };
  f.daily.values.set(finalPath, { ...final, results: final.results.slice(1) });
  expect(await f.usecase().execute(sha)).toMatchObject({ ok: false });
  expect(f.fetcher.fetch).not.toHaveBeenCalled();
});
it("preserves an unknown reservation through resume without refetch or successor", async () => {
  const f = await dailyFixture();
  const prepared = await f.usecase().prepare(implementation);
  if (!prepared.ok) throw new Error(prepared.error.detail);
  f.fetcher.fetch.mockRejectedValue(new Error("unknown OAuth/transport outcome"));
  expect(await f.usecase().execute(f.hash(prepared.value))).toMatchObject({ ok: false });
  const frozen = f.hash([...f.daily.values]);
  expect(await f.usecase().execute(f.hash(prepared.value))).toMatchObject({ ok: true, value: expect.arrayContaining([expect.objectContaining({ status: "uncertain" })]) });
  expect(f.hash([...f.daily.values])).toBe(frozen);
  expect([...f.daily.values.keys()].map((p) => p.split('/').at(-1)).sort()).toEqual(["batch-0.reserved.json", "operation.json"]);
  expect(f.fetcher.fetch).toHaveBeenCalledTimes(1); expect(f.projection.project).not.toHaveBeenCalled();
});
it("resumes preserved projection samples after lost acknowledgement without another fetch or duplicate effect", async () => {
  const f = await dailyFixture();
  const prepared = await f.usecase().prepare(implementation);
  if (!prepared.ok) throw new Error(prepared.error.detail);
  const first = refreshBatches(prepared.value.targets)[0]![0]!;
  const fetch: RetainedMetricFetchCapability["fetch"] = async (batch) => ok(batch.map((t) => ({ externalId: t.externalId,
    returned: t.sourceItemId === first.sourceItemId, reason: t.sourceItemId === first.sourceItemId ? null : "omitted",
    metadata: t.sourceItemId === first.sourceItemId ? { kind: "reddit_post", score: 42, numComments: 9 } : null })));
  f.fetcher.fetch.mockImplementation(fetch);
  const effects = new Set<string>(); let acknowledgementLost = false;
  f.projection.project.mockImplementation(async (...args: unknown[]) => {
    const command = args[0] as { samples: { metricsFingerprint: string }[]; observedAt: Date };
    effects.add(`${first.sourceItemId}:${command.observedAt.toISOString()}`);
    f.setCurrent(f.targets.map((t) => t.sourceItemId === first.sourceItemId ? { ...t, authority: { ...t.authority,
      metricsHash: command.samples[0]!.metricsFingerprint, observationAt: command.observedAt.toISOString(), observedAt: command.observedAt.toISOString() } } : t));
    if (!acknowledgementLost) { acknowledgementLost = true; throw new Error("lost commit acknowledgement"); }
    return { currentSnapshotsUpdated: 0, observationsAppended: 0, metricChanges: 0, regressionsObserved: 0 };
  });
  const sha = f.hash(prepared.value);
  expect(await f.usecase().execute(sha)).toMatchObject({ ok: true, value: expect.any(Array) });
  const observation = f.hash(f.daily.values.get(`${dailyGrant.evidencePath}/batch-0.observed.json`));
  const calls = f.fetcher.fetch.mock.calls.length;
  expect(await f.usecase().execute(sha)).toMatchObject({ ok: true, value: { results: expect.arrayContaining([expect.objectContaining({ status: "refreshed" })]) } });
  expect(f.hash(f.daily.values.get(`${dailyGrant.evidencePath}/batch-0.observed.json`))).toBe(observation);
  expect(f.fetcher.fetch).toHaveBeenCalledTimes(calls); expect(effects.size).toBe(1); expect(f.projection.project).toHaveBeenCalledTimes(2);
});
