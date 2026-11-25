import { RetainedMetricFetchAdapter } from "@social-monitor/ingestion/adapters/source/retained-metric-fetch.capability";
import { RenewRetainedMetricsUseCase } from "@social-monitor/ingestion/features/refresh-retained-metrics/renew-retained-metrics.use-case";
import { implementation, renewalFixture } from "./retained-metric-renewal.spec-support";

it.each(["hn", "reddit", "oauth"].flatMap((transport) => ["TimeoutError", "AbortError", "unknown"].map((failure) => [transport, failure]))) ("leaves %s %s unknown across restart with no successor, observation, final or retry", async (transport, failure) => {
  const f = renewalFixture();
  if (transport === "hn") {
    const changed = { ...f.targets[0]!, providerKey: "hacker-news" as const, externalId: "hn:123",
      canonicalUrl: "https://news.ycombinator.com/item?id=123" };
    // Change current identity only; the original remains a fully validated Reddit predecessor.
    f.setCurrent([changed, ...f.targets.slice(1)]);
  }
  const reject = async () => { throw Object.assign(new Error(failure), { name: failure }); };
  const hn = { getStory: jest.fn(reject) }, reddit = { getPostsByIds: jest.fn(reject) };
  const token = { getAccessToken: jest.fn(transport === "oauth" ? reject : async () => "fixture-token") };
  const adapter = new RetainedMetricFetchAdapter(hn, reddit, token, "fixture-agent");
  const usecase = () => new RenewRetainedMetricsUseCase(f.inventory, adapter, f.projection, f.prior, f.renewal, f.clock, f.hash);
  const prepared = await usecase().prepare(implementation); expect(prepared.ok).toBe(true);
  if (!prepared.ok) throw new Error(prepared.error.detail);
  expect(await usecase().execute(f.hash(prepared.value))).toMatchObject({ ok: false, error: { detail: "provider_outcome_unknown_reconcile_required" } });
  const before = f.hash([...f.renewal.values]);
  const resumed = await usecase().execute(f.hash(prepared.value));
  expect(resumed).toMatchObject({ ok: true, value: expect.arrayContaining([expect.objectContaining({ status: "uncertain" })]) });
  expect(f.hash([...f.renewal.values])).toBe(before);
  expect([...f.renewal.values.keys()].map((p) => p.split("/").at(-1)).sort()).toEqual(["batch-0.reserved.json", "operation.json"]);
  expect(hn.getStory).toHaveBeenCalledTimes(transport === "hn" ? 1 : 0);
  expect(reddit.getPostsByIds).toHaveBeenCalledTimes(transport === "reddit" ? 1 : 0);
  expect(token.getAccessToken).toHaveBeenCalledTimes(transport === "hn" ? 0 : 1);
  expect(f.projection.project).not.toHaveBeenCalled();
});
