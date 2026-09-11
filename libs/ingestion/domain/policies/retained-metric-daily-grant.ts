// Seven reviewed single-use incident authorities for the final E2E refresh.
// Prior September 9 evidence remains immutable at its original paths.
import { retainedMetricRenewalGrant } from "./retained-metric-renewal-grant";

export const retainedMetricDailyAuthorities = [
  {
    "date": "2026-08-30",
    "operationId": "036aa064-a511-5e4a-a4b0-72c14b0e9844",
    "evidencePath": "seven-day-6101-6102/retained-metrics-daily-20260910-2026-08-30"
  },
  {
    "date": "2026-08-31",
    "operationId": "b8f0c1b6-8fc1-5a75-b9ba-751b58e58ee6",
    "evidencePath": "seven-day-6101-6102/retained-metrics-daily-20260910-2026-08-31"
  },
  {
    "date": "2026-09-01",
    "operationId": "7b851fad-99fc-534d-b83b-b11752892569",
    "evidencePath": "seven-day-6101-6102/retained-metrics-daily-20260910-2026-09-01"
  },
  {
    "date": "2026-09-02",
    "operationId": "f1f6e28f-5098-537a-a579-7772005dca93",
    "evidencePath": "seven-day-6101-6102/retained-metrics-daily-20260910-2026-09-02"
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
    "operationId": "98a0c5da-4e3b-5c8f-956b-8c982d6fd7ce",
    "evidencePath": "seven-day-6101-6102/retained-metrics-daily-20260910-2026-09-05"
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
