// Seven reviewed single-use authorities for August 30–September 5, 2026 UTC.
// August 31, September 1, 2 and 5 each supersede their spent September 10
// authority once with a September 13 operation and fresh evidence path.
// Preserve all prior evidence bytes at their original paths as immutable history.
// August 30's September 13 authority and September 3/4 authorities stay unchanged.
import { retainedMetricRenewalGrant } from "./retained-metric-renewal-grant";

export const retainedMetricDailyAuthorities = [
  {
    "date": "2026-08-30",
    "operationId": "ea16e8e6-21fa-5106-9e1c-2a2c50544186",
    "evidencePath": "seven-day-6101-6102/retained-metrics-daily-20260913-2026-08-30"
  },
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
] as const;
export type MetricDailyDate = typeof retainedMetricDailyAuthorities[number]["date"];
export function retainedMetricDailyGrant(date: string) {
  const authority = retainedMetricDailyAuthorities.find((item) => item.date === date);
  if (!authority) return null;
  return {
    ...authority, version: "retained-metrics-daily.v1" as const,
    sourceBase: "823aa9eb673bfa88b60ed6f3db5e50bc34059833",
    tenantId: retainedMetricRenewalGrant.tenantId, workspaceId: retainedMetricRenewalGrant.workspaceId,
    dates: [authority.date],
    endAt: new Date(Date.parse(`${authority.date}T00:00:00.000Z`) + 86_400_000).toISOString(),
    bounds: { ...retainedMetricRenewalGrant.bounds },
  };
}

// Supplied actual predecessor byte pins; canonical resolvers remain mandatory.
// entryListSha hashes compact JSON with sorted keys of [{name, sha256}], sorted
// by filename (ASCII). It is not the existing [{name, bytesSha}] entries digest.
export const retainedMetricDailyPredecessorPins = {
  "retained-metrics-v1": {
    "operationBytesSha256": "f7482a69589bf776baa5e2be8234989296937a87e48c1b8e9b26e969c0d051a0",
    "operationEnvelopeDigest": "0f9fa678de1921b4847ab8f0224f96e4c367308bd56604d999cd670c16b8949a",
    "finalBytesSha256": "84406e32d6d6848a6f4aea02cbc1d115a0e9bf9752b81e212c9a289c17831681",
    "entryListSha256": "74ecc6ba55c35fd0ece1fb66c4690c0930badc079b5e8277de58dbfa358bedf1"
  },
  "retained-metrics-renewal-20260908": {
    "operationBytesSha256": "8ab96be0172c0ab56499a5203ca6f2f93692e2101cc94144b0a7702de8d15c70",
    "operationEnvelopeDigest": "8ef6430e0fa0bb5855f5df899e751ddf274b1dd0404c056e6a0080b101a0abdc",
    "finalBytesSha256": "815c5c184f2c99d584efe423cf94291e8680f0096a035b2c853b2bb4809db958",
    "entryListSha256": "6b7aa74454186688350cac27d10f969c0edfcac71ce5075ad578171232353345"
  }
} as const;
