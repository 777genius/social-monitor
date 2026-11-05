import { insertNativeRenewalSourceRows, nativeRenewalSourceRows } from "./retained-metric-native-fixture";
import { retainedMetricRenewalGrant as grant } from "@social-monitor/ingestion/domain/policies/retained-metric-renewal-grant";

it("preserves every original sequential insert value across seven bounded batches and a separate late arrival", async () => {
  const createMany = jest.fn(async ({ data }: { data: Record<string, unknown>[] }) => ({ count: data.length }));
  await insertNativeRenewalSourceRows({ createMany }, 0, 3306);
  expect(createMany.mock.calls.map(([args]) => args.data.length)).toEqual([500, 500, 500, 500, 500, 500, 306]);
  const seeded = createMany.mock.calls.flatMap(([args]) => args.data);
  const id = (suffix: number) => `00000000-0000-7000-8000-${String(suffix).padStart(12, "0")}`;
  // Independent reference to the former per-row insert, including all dates and metadata.
  const expected = Array.from({ length: 3307 }, (_, index) => ({
    id: id(100000 + index), tenantId: grant.tenantId, workspaceId: grant.workspaceId, sourceBindingId: id(6401), providerKey: "reddit",
    providerItemId: `reddit:t3_native${index}`, canonicalUrl: `https://www.reddit.com/comments/native${index}/`,
    title: "Renewal fixture", body: "Retained zero-feed body", contentHash: "native-renewal",
    publishedAt: new Date(`${grant.dates[index % 7]}T10:00:00Z`), observedAt: new Date("2026-09-05T11:00:00Z"),
    createdAt: new Date("2026-09-05T11:00:00Z"), metadata: { kind: "reddit_post", score: 5 },
  }));
  expect(seeded).toEqual(expected.slice(0, 3306));
  await insertNativeRenewalSourceRows({ createMany }, 3306, 1);
  expect(createMany.mock.calls[7]).toEqual([{ data: expected.slice(3306) }]);
  expect(new Set([...seeded, ...nativeRenewalSourceRows(3306, 1)].map((row) => row.id)).size + 19 + 4).toBe(3330);
  expect(createMany.mock.calls.every(([args]) => Object.keys(args).join() === "data")).toBe(true);
});

it("fails closed on short inserts and propagates duplicate/database errors without advancing batches", async () => {
  const short = jest.fn(async () => ({ count: 499 }));
  await expect(insertNativeRenewalSourceRows({ createMany: short }, 0, 3306)).rejects.toThrow();
  expect(short).toHaveBeenCalledTimes(1);
  const failure = new Error("fixture duplicate");
  const duplicate = jest.fn(async () => { throw failure; });
  await expect(insertNativeRenewalSourceRows({ createMany: duplicate }, 0, 3306)).rejects.toBe(failure);
  expect(duplicate).toHaveBeenCalledTimes(1);
});
