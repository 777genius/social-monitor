// Seven reviewed single-use incident authorities. No caller-selected IDs or paths.
// Original and spent September 8 authorities retain their independent policies.
import { retainedMetricRenewalGrant } from "./retained-metric-renewal-grant";

export const retainedMetricDailyAuthorities = [
  {
    "date": "2026-08-30",
    "operationId": "86770141-d9f3-51fb-bf59-aa4abeb17382",
    "evidencePath": "seven-day-6101-6102/retained-metrics-daily-20260909-2026-08-30"
  },
  {
    "date": "2026-08-31",
    "operationId": "8fb5d83e-8c23-5247-8504-c33c0f8f3dc5",
    "evidencePath": "seven-day-6101-6102/retained-metrics-daily-20260909-2026-08-31"
  },
  {
    "date": "2026-09-01",
    "operationId": "0b7667b2-6beb-5792-b40f-de555cea66d9",
    "evidencePath": "seven-day-6101-6102/retained-metrics-daily-20260909-2026-09-01"
  },
  {
    "date": "2026-09-02",
    "operationId": "fc9502a0-1ea0-549e-9ec7-5636bcd4504e",
    "evidencePath": "seven-day-6101-6102/retained-metrics-daily-20260909-2026-09-02"
  },
  {
    "date": "2026-09-03",
    "operationId": "615132b4-7a50-58c6-a442-11b356aadc7e",
    "evidencePath": "seven-day-6101-6102/retained-metrics-daily-20260909-2026-09-03"
  },
  {
    "date": "2026-09-04",
    "operationId": "a3ebd553-5563-5d97-af26-5c0d3c3c9cd1",
    "evidencePath": "seven-day-6101-6102/retained-metrics-daily-20260909-2026-09-04"
  },
  {
    "date": "2026-09-05",
    "operationId": "83c3311c-a3c2-50bc-877d-0a5b1cf76cf9",
    "evidencePath": "seven-day-6101-6102/retained-metrics-daily-20260909-2026-09-05"
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
