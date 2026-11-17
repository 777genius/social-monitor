import type { Pool } from "pg";
import type { DurableScanProviderKey } from "./durable-backend-e2e-scan-targets";
import type { JsonRecord } from "./durable-backend-e2e-json-fields";

export type ScheduledScanEvidence = {
  readonly providerKey: DurableScanProviderKey;
  readonly sourceBindingId: string;
  readonly scanPolicyId: string;
  readonly scanJobId: string;
  readonly scheduledIdempotencyKey: string;
  readonly status: "SUCCEEDED";
  readonly completedAt: string;
  readonly nextRunAtAfterSchedule: string;
  readonly feedItemCount: number;
  readonly feedItemIds: readonly string[];
};

export type AutoSummaryEvidence = {
  readonly summaryPolicyId: string;
  readonly summaryJobId: string;
  readonly summaryId: string;
  readonly idempotencyKey: string;
  readonly status: "completed" | "no_signal";
  readonly requestedAt: string;
  readonly completedAt: string;
  readonly latestFeedItemObservedAt: string;
  readonly newFeedItemCount: number;
};

type SnapshotParams = { readonly tenantId: string; readonly workspaceId: string };

/** Native evidence polling: injected snapshots and delay preserve the original runtime contract. */
export function createDurableBackendEvidencePollers(deps: {
  readonly pool: Pool;
  readonly scheduledScanEvidenceSnapshot: (db: Pool, params: SnapshotParams & {
    readonly sourceBindingId: string; readonly scanPolicyId: string;
  }) => Promise<JsonRecord | undefined>;
  readonly autoSummaryEvidenceSnapshot: (db: Pool, params: SnapshotParams & {
    readonly interestId: string;
  }) => Promise<JsonRecord | undefined>;
  readonly readString: (source: JsonRecord, field: string) => string;
  readonly readNumber: (source: JsonRecord, field: string) => number;
  readonly readStringArray: (source: JsonRecord, field: string) => readonly string[];
  readonly delay: (ms: number) => Promise<void>;
}) {
  const { pool, scheduledScanEvidenceSnapshot, autoSummaryEvidenceSnapshot,
    readString, readNumber, readStringArray, delay } = deps;

  async function pollScheduledScanEvidence(
    params: {
      readonly tenantId: string;
      readonly workspaceId: string;
      readonly providerKey: DurableScanProviderKey;
      readonly sourceBindingId: string;
      readonly scanPolicyId: string;
    },
    options: { readonly timeoutMs: number; readonly label: string },
  ): Promise<ScheduledScanEvidence> {
    const deadline = Date.now() + options.timeoutMs;
    let lastValue: JsonRecord | undefined;
  
    while (Date.now() < deadline) {
      const value = await scheduledScanEvidenceSnapshot(pool, params);
      lastValue = value;
  
      if (value !== undefined) {
        const status = readString(value, "status");
        if (status === "FAILED" || status === "CANCELLED") {
          throw new Error(
            `${options.label} ended with ${status}: ${String(value.failureReason ?? "")}`,
          );
        }
  
        const feedItemCount = readNumber(value, "feedItemCount");
        if (status === "SUCCEEDED" && feedItemCount > 0) {
          return {
            providerKey: params.providerKey,
            sourceBindingId: params.sourceBindingId,
            scanPolicyId: params.scanPolicyId,
            scanJobId: readString(value, "scanJobId"),
            scheduledIdempotencyKey: readString(value, "scheduledIdempotencyKey"),
            status: "SUCCEEDED",
            completedAt: readString(value, "completedAt"),
            nextRunAtAfterSchedule: readString(value, "nextRunAtAfterSchedule"),
            feedItemCount,
            feedItemIds: readStringArray(value, "feedItemIds"),
          };
        }
      }
  
      await delay(1_000);
    }
  
    throw new Error(
      `${options.label} did not complete before timeout; last=${JSON.stringify(lastValue ?? {})}`,
    );
  }
  
  async function pollAutoSummaryEvidence(
    params: {
      readonly tenantId: string;
      readonly workspaceId: string;
      readonly interestId: string;
      readonly summaryPolicyId: string;
    },
    options: { readonly timeoutMs: number; readonly label: string },
  ): Promise<AutoSummaryEvidence> {
    const deadline = Date.now() + options.timeoutMs;
    let lastValue: JsonRecord | undefined;
  
    while (Date.now() < deadline) {
      const value = await autoSummaryEvidenceSnapshot(pool, params);
      lastValue = value;
  
      if (value !== undefined) {
        const status = readString(value, "status");
        if (status === "failed" || status === "rejected") {
          throw new Error(
            `${options.label} ended with ${status}: ${String(value.failureReason ?? "")}`,
          );
        }
  
        if (
          (status === "completed" || status === "no_signal") &&
          readString(value, "summaryId").trim().length > 0
        ) {
          return {
            summaryPolicyId: params.summaryPolicyId,
            summaryJobId: readString(value, "summaryJobId"),
            summaryId: readString(value, "summaryId"),
            idempotencyKey: readString(value, "idempotencyKey"),
            status,
            requestedAt: readString(value, "requestedAt"),
            completedAt: readString(value, "completedAt"),
            latestFeedItemObservedAt: readString(
              value,
              "latestFeedItemObservedAt",
            ),
            newFeedItemCount: readNumber(value, "newFeedItemCount"),
          };
        }
      }
  
      await delay(1_000);
    }
  
    throw new Error(
      `${options.label} did not complete before timeout; last=${JSON.stringify(lastValue ?? {})}`,
    );
  }

  return { pollScheduledScanEvidence, pollAutoSummaryEvidence };
}
