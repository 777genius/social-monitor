import { retainedMetricDailyAuthorities, retainedMetricDailyGrant } from "./retained-metric-daily-grant";

it("preserves the August 30 superseding authority with one fixed operation and fresh evidence path", () => {
  const grant = retainedMetricDailyGrant("2026-08-30")!;
  expect(grant).toEqual({
    date: "2026-08-30",
    operationId: "ea16e8e6-21fa-5106-9e1c-2a2c50544186",
    evidencePath: "seven-day-6101-6102/retained-metrics-daily-20260913-2026-08-30",
    version: "retained-metrics-daily.v1",
    sourceBase: "823aa9eb673bfa88b60ed6f3db5e50bc34059833",
    tenantId: "00000000-0000-7000-8000-000000006101",
    workspaceId: "00000000-0000-7000-8000-000000006102",
    dates: ["2026-08-30"],
    endAt: "2026-08-31T00:00:00.000Z",
    bounds: { targets: 10000, redditBatch: 100, hnBatch: 1, attempts: 1, concurrency: 1, timeoutMs: 10000 },
  });
  expect(retainedMetricDailyGrant("2026-08-30")).toEqual(grant);
  expect(retainedMetricDailyAuthorities.filter((a) => a.date === "2026-08-30")).toHaveLength(1);
  expect(retainedMetricDailyAuthorities.some((a) => String(a.operationId) === "036aa064-a511-5e4a-a4b0-72c14b0e9844")).toBe(false);
});

it("pins four fresh single-use authorities and preserves September 3 and 4 exactly", () => {
  expect(retainedMetricDailyAuthorities.filter((a) => a.date !== "2026-08-30")).toEqual([
  {
    "date": "2026-08-31",
    "operationId": "9a4ae7f7-a980-4bc8-84ab-dae3a554979b",
    "evidencePath": "seven-day-6101-6102/retained-metrics-daily-20260913-2026-08-31"
  },
  {
    "date": "2026-09-01",
    "operationId": "1ce8c0b0-e6eb-4398-8154-7f70b98e666a",
    "evidencePath": "seven-day-6101-6102/retained-metrics-daily-20260913-2026-09-01"
  },
  {
    "date": "2026-09-02",
    "operationId": "c778513e-5f8f-40fb-a0fb-d3d04ebbcf0d",
    "evidencePath": "seven-day-6101-6102/retained-metrics-daily-20260913-2026-09-02"
  },
  {
    "date": "2026-09-03",
    "operationId": "0c3cd874-29cf-5310-876c-b0395210127b",
    "evidencePath": "seven-day-6101-6102/retained-metrics-daily-20260910-2026-09-03"
  },
  {
    "date": "2026-09-04",
    "operationId": "dc918eab-879b-5070-b952-632561a272fc",
    "evidencePath": "seven-day-6101-6102/retained-metrics-daily-20260910-2026-09-04"
  },
  {
    "date": "2026-09-05",
    "operationId": "28a3a18f-f88a-4545-b964-b0058e42452e",
    "evidencePath": "seven-day-6101-6102/retained-metrics-daily-20260913-2026-09-05"
  }
]);
  expect(retainedMetricDailyAuthorities).toHaveLength(7);
  expect(new Set(retainedMetricDailyAuthorities.map((a) => a.operationId)).size).toBe(7);
  expect(new Set(retainedMetricDailyAuthorities.map((a) => a.evidencePath)).size).toBe(7);
});

it.each(["2026-08-29", "2026-09-06", "2026-08-30T00:00:00Z", "2026-08-30 ", "../2026-08-30", ""])(
  "rejects unreviewed or noncanonical date %s", (date) => {
    expect(retainedMetricDailyGrant(date)).toBeNull();
  },
);
