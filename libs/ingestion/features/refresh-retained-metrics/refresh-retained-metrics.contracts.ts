import type { JsonObject, Result } from "@social-monitor/shared-kernel";
import type { SourceEngagementSample } from "../../ports/source-engagement-projection.port";

export type RefreshProvider = "hacker-news" | "reddit";
export type RefreshScope = { tenantId: string; workspaceId: string; dates: readonly string[]; endAt: string };
export type MetricAuthority = {
  metricsHash: string | null; observedAt: string | null; observationAt: string | null;
  observationCount: number; regressionCount: number;
};
export type RetainedMetricTarget = {
  sourceItemId: string; externalId: string; sourceBindingId: string;
  providerKey: RefreshProvider; canonicalUrl: string; publishedAt: string;
  tenantId: string; workspaceId: string; configDigest: string;
  identityDigest: string; feedDigest: string; visibleFeedCount: number;
  rejection: string | null; authority: MetricAuthority;
};
export type MetricRefreshManifest = {
  version: "retained-metrics.v1"; sourceBase: string; bounds: { targets: number; redditBatch: number; hnBatch: number; attempts: number; concurrency: number; timeoutMs: number }; operationId: string; evidencePath: string;
  scope: RefreshScope; plannedAt: string; targets: readonly RetainedMetricTarget[];
};
export interface RetainedMetricInventory {
  list(scope: RefreshScope): Promise<readonly RetainedMetricTarget[]>;
  read(scope: RefreshScope, sourceItemId: string): Promise<RetainedMetricTarget | null>;
}
export type MetricFetchObservation = {
  externalId: string; returned: boolean; metadata: JsonObject | null; reason: string | null;
};
export interface RetainedMetricFetchCapability {
  fetch(targets: readonly RetainedMetricTarget[]): Promise<Result<readonly MetricFetchObservation[], string>>;
}
// Immutable, exclusive create + fsync. Existing bytes must match; never replace.
export interface MetricRefreshReceipts {
  read<T>(path: string): Promise<T | null>;
  install(path: string, value: unknown): Promise<"installed" | "replayed">;
}
export type PreservedMetricObservation = {
  externalId: string; returned: boolean; observedAt: string; metadata: JsonObject | null;
  sample: (Omit<SourceEngagementSample, "publishedAt"> & { publishedAt: string }) | null;
  reason: string | null;
};
export type MetricRefreshOutcome = {
  sourceItemId: string; externalId: string; providerKey: RefreshProvider; date: string;
  status: "refreshed" | "superseded" | "unavailable" | "failed" | "uncertain";
  returned: boolean; reason: string | null; observedAt: string | null;
  before: MetricAuthority; after: MetricAuthority;
};
export type RefreshDigest = (value: unknown) => string;
