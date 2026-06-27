import type { MetricsRecorderPort } from "@social-monitor/platform-metrics";
import type { QueueCommandEnvelope } from "@social-monitor/platform-queue";
import type { WorkerRuntime } from "@social-monitor/platform-worker";
import {
  DomainError,
  tenantId,
  workspaceId,
} from "@social-monitor/shared-kernel";

import type { ReaderSummaryJobStatus } from "../../domain";
import type { ExecuteReaderSummaryJobUseCase } from "../../features/execute-reader-summary-job/execute-reader-summary-job.use-case";
import { EXECUTE_READER_SUMMARY_JOB_COMMAND_TYPE } from "../../ports";

type ExecuteReaderSummaryJobQueuePayload = {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly readerSummaryJobId: string;
  readonly maxEvidenceItems?: number;
};

export type ExecuteReaderSummaryJobQueueCommand =
  QueueCommandEnvelope<ExecuteReaderSummaryJobQueuePayload>;

export type ExecuteReaderSummaryJobQueueResult = {
  readonly readerSummaryJobId: string;
  readonly status: ReaderSummaryJobStatus;
  readonly readerSummaryId?: string;
};

export class ExecuteReaderSummaryJobCommandHandler {
  constructor(
    private readonly executeReaderSummaryJob: ExecuteReaderSummaryJobUseCase,
    private readonly metrics: MetricsRecorderPort,
    private readonly runtime: WorkerRuntime,
  ) {}

  async handle(
    command: QueueCommandEnvelope<Readonly<Record<string, unknown>>>,
  ): Promise<ExecuteReaderSummaryJobQueueResult> {
    if (!isSupportedCommandType(command.commandType)) {
      throw new Error(`Unsupported command type: ${command.commandType}`);
    }

    return this.runtime.runIfAccepting(command.commandType, async () => {
      const payload = parsePayload(command.payload);
      this.recordMetric("started");
      let failureRecorded = false;

      try {
        const result = await this.executeReaderSummaryJob.execute({
          tenantId: tenantId(payload.tenantId),
          workspaceId: workspaceId(payload.workspaceId),
          readerSummaryJobId: payload.readerSummaryJobId,
          maxEvidenceItems: payload.maxEvidenceItems,
        });

        if (!result.ok) {
          this.recordMetric("failed");
          this.recordFailureClassMetric(result.error);
          failureRecorded = true;
          throw result.error;
        }

        this.recordMetric(completionMetricStatus(result.value.status));
        return {
          readerSummaryJobId: result.value.readerSummaryJobId,
          status: result.value.status,
          readerSummaryId: result.value.readerSummaryId,
        };
      } catch (error) {
        if (!failureRecorded) {
          this.recordMetric("failed");
          this.recordFailureClassMetric(error);
        }
        throw error;
      }
    });
  }

  private recordMetric(status: ReaderSummaryJobMetricStatus): void {
    this.metrics.incrementCounter({
      name: "summary_jobs_total",
      labels: {
        job_type: "readerSummary",
        status,
        worker: "intelligence-worker",
      },
    });
  }

  private recordFailureClassMetric(error: unknown): void {
    this.metrics.incrementCounter({
      name: "summary_job_failures_total",
      labels: {
        failure_class: classifyFailure(error),
        job_type: "readerSummary",
        worker: "intelligence-worker",
      },
    });
  }
}

type ReaderSummaryJobMetricStatus =
  "started" | "succeeded" | "failed" | "no_signal";

const completionMetricStatus = (
  status: ReaderSummaryJobStatus,
): ReaderSummaryJobMetricStatus => {
  if (status === "failed") {
    return "failed";
  }

  if (status === "no_signal") {
    return "no_signal";
  }

  return "succeeded";
};

const classifyFailure = (
  error: unknown,
):
  | "budget_exceeded"
  | "citation_validation_failed"
  | "worker_conflict"
  | "system_failure" => {
  if (error instanceof DomainError) {
    const kind = error.details.kind;

    if (kind === "budget_exceeded") {
      return "budget_exceeded";
    }

    if (kind === "citation_validation_failed") {
      return "citation_validation_failed";
    }

    if (
      error.code === "operation.conflict" ||
      error.code === "operation.backpressure"
    ) {
      return "worker_conflict";
    }
  }

  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error).toLowerCase();

  if (message.includes("budget")) {
    return "budget_exceeded";
  }

  if (message.includes("citation")) {
    return "citation_validation_failed";
  }

  if (
    message.includes("conflict") ||
    message.includes("running") ||
    message.includes("backpressure")
  ) {
    return "worker_conflict";
  }

  return "system_failure";
};

const parsePayload = (
  payload: Readonly<Record<string, unknown>>,
): ExecuteReaderSummaryJobQueuePayload => ({
  tenantId: readTenantScopeString(payload, "tenantId"),
  workspaceId: readTenantScopeString(payload, "workspaceId"),
  readerSummaryJobId: readString(payload, "readerSummaryJobId"),
  maxEvidenceItems: readOptionalPositiveInteger(payload, "maxEvidenceItems"),
});

const isSupportedCommandType = (commandType: string): boolean =>
  commandType === EXECUTE_READER_SUMMARY_JOB_COMMAND_TYPE;

const readString = (
  payload: Readonly<Record<string, unknown>>,
  field: string,
): string => {
  const value = payload[field];
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  throw new Error(
    `Invalid execute reader summary job command payload field: ${field}`,
  );
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

  return value.trim();
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
    throw new Error(
      `Invalid execute reader summary job command payload field: ${field}`,
    );
  }

  return value;
};
