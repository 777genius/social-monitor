import { implementation, renewalFixture } from "../../../../scripts/lib/retained-metric-renewal.spec-support";
import { retainedMetricRenewalGrant as grant } from "../../domain/policies/retained-metric-renewal-grant";

import { RenewRetainedMetricsUseCase } from "./renew-retained-metrics.use-case";

jest.setTimeout(180_000);
describe("renewal irreversible budget and terminal replay", () => {
  it("binds full capture SHA and returns identical terminal evidence after content drift with zero business or journal writes", async () => {
    const f = renewalFixture(), prepared = await f.usecase().prepare(implementation);
    if (!prepared.ok) throw new Error(prepared.error.detail);
    expect(f.usecase()).toBeInstanceOf(RenewRetainedMetricsUseCase);
    const sha = f.hash(prepared.value);
    const completed = await f.usecase().execute(sha);
    expect(completed.ok).toBe(true);
    const final = f.renewal.values.get(`${grant.evidencePath}/final.json`);
    expect(final).toBeDefined();
    expect(f.renewal.values.get(`${grant.evidencePath}/batch-0.reserved.json`)).toMatchObject({ manifestDigest: sha });
    expect(sha).not.toBe(f.hash({ ...f.original, targets: prepared.value.targets }));
    f.setCurrent([]); f.inventory.list.mockClear(); f.inventory.read.mockClear(); f.fetcher.fetch.mockClear(); f.projection.project.mockClear(); f.renewal.install.mockClear();
    expect(await f.usecase().execute(sha)).toEqual(completed);
    expect(await f.usecase().prepare(implementation)).toEqual(prepared);
    for (const spy of [f.inventory.list, f.inventory.read, f.fetcher.fetch, f.projection.project, f.renewal.install]) expect(spy).not.toHaveBeenCalled();
    expect(f.renewal.values.get(`${grant.evidencePath}/final.json`)).toEqual(final);
    expect(await f.usecase().execute("d".repeat(64))).toMatchObject({ ok: false });
  });
  it("reserves before fetch and never refetches unknown or starts a successor batch", async () => {
    const f = renewalFixture(), prepared = await f.usecase().prepare(implementation);
    if (!prepared.ok) throw new Error(prepared.error.detail);
    f.fetcher.fetch.mockImplementationOnce(async () => {
      expect(f.prior.held && f.renewal.held).toBe(true);
      expect(f.renewal.values.has(`${grant.evidencePath}/batch-0.reserved.json`)).toBe(true);
      throw new Error("unknown provider completion");
    });
    const sha = f.hash(prepared.value);
    expect(await f.usecase().execute(sha)).toMatchObject({ ok: false });
    const resumed = await f.usecase().execute(sha);
    expect(resumed).toMatchObject({ ok: true });
    expect(f.fetcher.fetch).toHaveBeenCalledTimes(1);
    expect(f.renewal.values.has(`${grant.evidencePath}/batch-1.reserved.json`)).toBe(false);
    expect(f.renewal.values.has(`${grant.evidencePath}/final.json`)).toBe(false);
    expect(f.projection.project).not.toHaveBeenCalled();
  });
});
