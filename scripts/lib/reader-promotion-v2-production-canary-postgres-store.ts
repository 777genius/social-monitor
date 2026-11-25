import type { Pool } from "pg";

import {
  CANARY_SINGLETON_ID,
  type CanaryArtifact,
  type CanaryBinding,
  type CanaryOutcome,
  type CanaryReceipt,
  type CanaryRequestedBinding,
  type CanaryState,
} from "./reader-promotion-v2-production-canary-contract";
import type {
  CanaryClaim,
  CanaryProviderBarrier,
  CanarySnapshot,
  ReaderPromotionV2ProductionCanaryStore,
} from "./reader-promotion-v2-production-canary-store";

type QueryClient = Pick<Pool, "query">;

export class PostgresReaderPromotionV2ProductionCanaryStore
implements ReaderPromotionV2ProductionCanaryStore {
  constructor(private readonly client: QueryClient) {}

  async claim(binding: CanaryRequestedBinding): Promise<CanaryClaim> {
    const row = await this.call("claim", [bindingJson(binding)]);
    const snapshot = parseSnapshot(row.snapshot);
    const action = row.action;
    if (action !== "OWNER" && action !== "IN_PROGRESS" &&
        action !== "TERMINAL") throw new Error("canary_store_action_invalid");
    return { action, snapshot };
  }

  async markModelRunning(binding: CanaryBinding): Promise<CanaryProviderBarrier> {
    const row = await this.call("mark_model_running", [bindingJson(binding)]);
    if (row.action !== "ENTER" && row.action !== "IN_PROGRESS") {
      throw new Error("canary_store_barrier_invalid");
    }
    return { action: row.action, snapshot: parseSnapshot(row.snapshot) };
  }

  async completeModel(params: {
    readonly binding: CanaryBinding;
    readonly outcome: CanaryOutcome;
    readonly artifact: CanaryArtifact | null;
    readonly artifactSha256: string | null;
  }): Promise<CanarySnapshot> {
    const row = await this.call("complete_model", [
      bindingJson(params.binding), params.outcome, params.artifact ?? null,
      params.artifactSha256,
    ]);
    return parseSnapshot(row.snapshot);
  }

  async finalize(params: {
    readonly binding: CanaryBinding;
    readonly receipt: CanaryReceipt;
    readonly receiptSha256: string;
  }): Promise<CanarySnapshot> {
    const row = await this.call("finalize", [
      bindingJson(params.binding), params.receipt, params.receiptSha256,
    ]);
    return parseSnapshot(row.snapshot);
  }

  async rejectUncertain(binding: CanaryBinding): Promise<CanarySnapshot> {
    const row = await this.call("reject_uncertain", [bindingJson(binding)]);
    return parseSnapshot(row.snapshot);
  }

  async read(): Promise<CanarySnapshot | null> {
    const result = await this.client.query<{ snapshot: unknown }>(
      "select reader_promotion_v2_canary_control.read() as snapshot",
    );
    const value = result.rows[0]?.snapshot;
    return value === null || value === undefined ? null : parseSnapshot(value);
  }

  private async call(
    name: "claim" | "mark_model_running" | "complete_model" | "finalize" |
      "reject_uncertain",
    values: readonly unknown[],
  ): Promise<{ readonly action?: unknown; readonly snapshot: unknown }> {
    const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
    const result = await this.client.query<{
      action?: unknown;
      snapshot: unknown;
    }>(`select * from reader_promotion_v2_canary_control.${name}(${placeholders})`,
      [...values]);
    const row = result.rows[0];
    if (row === undefined) throw new Error("canary_store_result_missing");
    return row;
  }
}

const bindingJson = (
  binding: CanaryBinding | CanaryRequestedBinding,
): Record<string, unknown> => ({
  ...binding,
  ...("reconciliationDeadline" in binding ? {
    reconciliationDeadline: binding.reconciliationDeadline.toISOString(),
  } : {}),
});

const parseSnapshot = (value: unknown): CanarySnapshot => {
  if (!record(value) || !record(value.binding) ||
      value.binding.singletonId !== CANARY_SINGLETON_ID ||
      typeof value.binding.reconciliationDeadline !== "string" ||
      !state(value.state) ||
      !(value.outcome === null || outcome(value.outcome)) ||
      !(value.artifact === null || record(value.artifact)) ||
      !(value.artifactSha256 === null || typeof value.artifactSha256 === "string") ||
      !(value.receipt === null || record(value.receipt)) ||
      !(value.rejectionCode === null || typeof value.rejectionCode === "string")) {
    throw new Error("canary_store_snapshot_invalid");
  }
  return {
    binding: {
      ...(value.binding as unknown as Omit<
        CanaryBinding,
        "reconciliationDeadline"
      >),
      reconciliationDeadline: new Date(value.binding.reconciliationDeadline),
    },
    state: value.state,
    outcome: value.outcome,
    artifact: value.artifact as CanaryArtifact | null,
    artifactSha256: value.artifactSha256,
    receipt: value.receipt as unknown as CanaryReceipt | null,
    rejectionCode: value.rejectionCode,
  };
};

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const state = (value: unknown): value is CanaryState =>
  ["CLAIMED", "MODEL_RUNNING", "MODEL_COMPLETED", "SUCCEEDED", "REJECTED"]
    .includes(value as CanaryState);
const outcome = (value: unknown): value is CanaryOutcome =>
  ["RESPONSE", "EXPLICIT_FAILURE", "UNCERTAIN"].includes(
    value as CanaryOutcome,
  );
