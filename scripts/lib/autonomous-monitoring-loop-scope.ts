import { tenantId, type TenantId, workspaceId, type WorkspaceId } from "@social-monitor/shared-kernel";
import type { SourceQuery } from "../../libs/ingestion/ports";
import type { SourceBindingConfig } from "../../libs/monitoring/ports";

export type ProviderKey =
  "reddit" | "github-issues" | "github-trending-page" | "rss" | "hacker-news";

export type QueuedScanPayload = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scanJobId: string;
  readonly interestId: string;
  readonly sourceBindingId: string;
  readonly scanPolicyId: string;
  readonly providerKey: ProviderKey;
  readonly sourceQuery: SourceQuery;
};

export type ScanBinding = {
  readonly providerKey: ProviderKey;
  readonly sourceBindingId: string;
  readonly scanPolicyId: string;
  readonly intervalSeconds: number;
  readonly freshnessSeconds: number;
};

export type ProviderTarget = {
  readonly providerKey: ProviderKey;
  readonly config: SourceBindingConfig;
  readonly freshnessSeconds: number;
};

export type ScanMetric = {
  readonly providerKey: ProviderKey;
  readonly fetched: number;
  readonly inserted: number;
  readonly skippedDuplicates: number;
  readonly projected: number;
};

export const fixedNow = new Date("2026-06-22T12:00:00.000Z");

export const digestDueAt = new Date("2026-06-22T12:00:01.000Z");

export const digestSchedulerNow = new Date("2026-06-22T12:00:02.000Z");

export const tenant = tenantId("00000000-0000-7000-8000-000000000703");

export const workspace = workspaceId("00000000-0000-7000-8000-000000000704");

export const userId = "user-autonomous-monitoring-loop-smoke";

export const correlationId = "corr-autonomous-monitoring-loop-smoke";

export const evidencePath = "ops/release/autonomous-monitoring-loop-evidence.json";

export const providerKeys: readonly ProviderKey[] = [
  "reddit",
  "github-issues",
  "github-trending-page",
  "rss",
  "hacker-news",
];
