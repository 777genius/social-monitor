import type { MetricsRecorderPort } from "@social-monitor/platform-metrics";
import type { QueueCommandEnvelope } from "@social-monitor/platform-queue";
import type { WorkerRuntime } from "@social-monitor/platform-worker";
import {
  DomainError,
  emptyJsonObjectAsUndefined,
  normalizeJsonObject,
  tenantId,
  workspaceId,
} from "@social-monitor/shared-kernel";

import type { ExecuteScanUseCase } from "../../features/execute-scan/execute-scan.use-case";
import type { ExecuteScanResult } from "../../features/execute-scan/execute-scan.result";
import type { SourceQuery, SourceQueryMode } from "../../ports";

type ExecuteScanQueuePayload = {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly scanJobId: string;
  readonly interestId: string;
  readonly sourceBindingId: string;
  readonly scanPolicyId: string;
  readonly providerKey: string;
  readonly sourceQuery: SourceQuery;
  readonly interestQuerySnapshot?: string;
  readonly attemptNumber?: number;
  readonly retryBudget?: number;
  readonly workerId?: string;
  readonly leaseTtlSeconds?: number;
};

export type ExecuteScanQueueCommand =
  QueueCommandEnvelope<ExecuteScanQueuePayload>;

export class ExecuteScanCommandHandler {
  constructor(
    private readonly executeScan: ExecuteScanUseCase,
    private readonly metrics: MetricsRecorderPort,
    private readonly runtime: WorkerRuntime,
  ) {}

  async handle(
    command: QueueCommandEnvelope<Readonly<Record<string, unknown>>>,
  ): Promise<ExecuteScanResult> {
    if (command.commandType !== "ingestion.scan.execute") {
      throw new Error(`Unsupported command type: ${command.commandType}`);
    }

    return this.runtime.runIfAccepting(command.commandType, async () => {
      const payload = parsePayload(command.payload);
      this.recordMetric("started");
      let failureRecorded = false;

      try {
        const result = await this.executeScan.execute({
          tenantId: tenantId(payload.tenantId),
          workspaceId: workspaceId(payload.workspaceId),
          scanJobId: payload.scanJobId,
          interestId: payload.interestId,
          sourceBindingId: payload.sourceBindingId,
          scanPolicyId: payload.scanPolicyId,
          providerKey: payload.providerKey,
          sourceQuery: payload.sourceQuery,
          interestQuerySnapshot: payload.interestQuerySnapshot,
          correlationId: command.correlationId,
          causationId: command.causationId ?? command.commandId,
          attemptNumber: payload.attemptNumber,
          retryBudget: payload.retryBudget,
          workerId: payload.workerId,
          leaseTtlSeconds: payload.leaseTtlSeconds,
        });

        if (!result.ok) {
          this.recordMetric("failed");
          this.recordFailureClassMetric(result.error);
          failureRecorded = true;
          throw result.error;
        }

        this.recordMetric("succeeded");
        return result.value;
      } catch (error) {
        if (!failureRecorded) {
          this.recordMetric("failed");
          this.recordFailureClassMetric(error);
        }
        throw error;
      }
    });
  }

  private recordMetric(status: "started" | "succeeded" | "failed"): void {
    this.metrics.incrementCounter({
      name: "scan_jobs_total",
      labels: {
        job_type: "scan",
        status,
        worker: "ingestion-worker",
      },
    });
  }

  private recordFailureClassMetric(error: unknown): void {
    this.metrics.incrementCounter({
      name: "scan_failures_total",
      labels: {
        failure_class: classifyFailure(error),
        job_type: "scan",
        worker: "ingestion-worker",
      },
    });
  }
}

const classifyFailure = (
  error: unknown,
):
  | "provider_rate_limited"
  | "provider_unavailable"
  | "worker_conflict"
  | "system_failure" => {
  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error).toLowerCase();

  if (message.includes("rate limit") || message.includes("429")) {
    return "provider_rate_limited";
  }

  if (message.includes("provider") || message.includes("unavailable")) {
    return "provider_unavailable";
  }

  if (message.includes("lease") || message.includes("already")) {
    return "worker_conflict";
  }

  return "system_failure";
};

const parsePayload = (
  payload: Readonly<Record<string, unknown>>,
): ExecuteScanQueuePayload => ({
  tenantId: readTenantScopeString(payload, "tenantId"),
  workspaceId: readTenantScopeString(payload, "workspaceId"),
  scanJobId: readString(payload, "scanJobId"),
  interestId: readString(payload, "interestId"),
  sourceBindingId: readString(payload, "sourceBindingId"),
  scanPolicyId: readString(payload, "scanPolicyId"),
  providerKey: readString(payload, "providerKey"),
  sourceQuery: readSourceQuery(payload, "sourceQuery"),
  interestQuerySnapshot: readOptionalString(payload, "interestQuerySnapshot"),
  attemptNumber: readOptionalPositiveInteger(payload, "attemptNumber"),
  retryBudget: readOptionalNonNegativeInteger(payload, "retryBudget"),
  workerId: readOptionalString(payload, "workerId"),
  leaseTtlSeconds: readOptionalPositiveInteger(payload, "leaseTtlSeconds"),
});

const readString = (
  payload: Readonly<Record<string, unknown>>,
  field: string,
): string => {
  const value = payload[field];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid execute scan command payload field: ${field}`);
  }

  return value;
};

const readTenantScopeString = (
  payload: Readonly<Record<string, unknown>>,
  field: string,
): string => {
  const value = payload[field];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new DomainError(
      "tenant.scope_missing",
      `${field} command payload field is required`,
    );
  }

  return value;
};

const readOptionalString = (
  payload: Readonly<Record<string, unknown>>,
  field: string,
): string | undefined => {
  const value = payload[field];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid execute scan command payload field: ${field}`);
  }

  return value;
};

const readOptionalPositiveInteger = (
  payload: Readonly<Record<string, unknown>>,
  field: string,
): number | undefined => {
  const value = payload[field];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`Invalid execute scan command payload field: ${field}`);
  }

  return value;
};

const readOptionalNonNegativeInteger = (
  payload: Readonly<Record<string, unknown>>,
  field: string,
): number | undefined => {
  const value = payload[field];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid execute scan command payload field: ${field}`);
  }

  return value;
};

const sourceQueryModes: readonly SourceQueryMode[] = [
  "search",
  "listing",
  "account_feed",
  "thread",
  "url",
];

const readSourceQuery = (
  payload: Readonly<Record<string, unknown>>,
  field: string,
): SourceQuery => {
  const value = payload[field];

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Invalid execute scan command payload field: ${field}`);
  }

  const queryPayload = value as Readonly<Record<string, unknown>>;
  const mode = queryPayload.mode;
  const query = queryPayload.query;
  const parameters = readSourceQueryParameters(queryPayload.parameters, field);

  if (
    typeof mode !== "string" ||
    !sourceQueryModes.includes(mode as SourceQueryMode)
  ) {
    throw new Error(
      `Invalid execute scan command payload field: ${field}.mode`,
    );
  }

  if (typeof query !== "string" || query.trim().length === 0) {
    throw new Error(
      `Invalid execute scan command payload field: ${field}.query`,
    );
  }

  return {
    mode: mode as SourceQueryMode,
    query: query.trim(),
    ...(parameters === undefined ? {} : { parameters }),
  };
};

const readSourceQueryParameters = (
  value: unknown,
  field: string,
): SourceQuery["parameters"] => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(
      `Invalid execute scan command payload field: ${field}.parameters`,
    );
  }

  return emptyJsonObjectAsUndefined(normalizeJsonObject(value));
};
