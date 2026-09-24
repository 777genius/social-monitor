import { PrismaScanCursorRepository } from "@social-monitor/ingestion/adapters/persistence/prisma/prisma-scan-cursor.repository";
import type {
  ScanCursorRepositoryPort,
  ScanExecutionReporterPort,
} from "@social-monitor/ingestion/ports";
import { PrismaScanJobRepository } from "@social-monitor/monitoring/adapters/persistence/prisma/prisma-scan-job.repository";
import type { Clock, IdGenerator, TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

import type { PrismaIngestionWorkerConnection } from "../../apps/ingestion-worker/src/adapters/persistence/prisma-ingestion-worker-connection";
import { ProductionCollectionScanJobReporter } from "./production-collection-scan-job-reporter";

export type CollectionScanAttemptScope = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly sourceBindingId: string;
  readonly scanPolicyId: string;
};

/** Supply the whole execution boundary so a recovery cannot inherit a live cursor. */
export type CollectionScanExecution = {
  readonly scanCursors: ScanCursorRepositoryPort;
  readonly reporter: ScanExecutionReporterPort;
  readonly scanJobIdForAttempt: (scope: CollectionScanAttemptScope) => string;
  readonly correlationId: string;
  readonly causationId: string;
};

export const composeCollectionScanExecution = (
  connection: PrismaIngestionWorkerConnection,
  ids: IdGenerator,
  clock: Clock,
  explicit?: CollectionScanExecution,
): CollectionScanExecution => {
  if (explicit !== undefined) {
    if (
      typeof explicit.scanCursors?.findBySourceBinding !== "function" ||
      typeof explicit.scanCursors?.save !== "function" ||
      typeof explicit.reporter?.reportSucceeded !== "function" ||
      typeof explicit.reporter?.reportFailed !== "function" ||
      typeof explicit.scanJobIdForAttempt !== "function" ||
      !explicit.correlationId?.trim() ||
      !explicit.causationId?.trim()
    ) {
      throw new Error("Explicit collection scan execution boundary is incomplete");
    }
    return explicit;
  }
  const reporter = new ProductionCollectionScanJobReporter(
    new PrismaScanJobRepository(connection), ids, clock,
  );
  return {
    scanCursors: new PrismaScanCursorRepository(connection, ids),
    reporter,
    scanJobIdForAttempt: (scope) => reporter.beginAttempt(scope),
    correlationId: "reader-summary-clean-real-day-collection",
    causationId: "manual-clean-real-day-proof",
  };
};
