import { PrismaScanCursorRepository } from "@social-monitor/ingestion/adapters/persistence/prisma/prisma-scan-cursor.repository";
import { IsolatedScanCursorRepository } from "@social-monitor/ingestion/adapters/persistence/isolated-scan-cursor.repository";
import { CryptoIdGenerator, SystemClock, tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type { PrismaIngestionWorkerConnection } from "../../apps/ingestion-worker/src/adapters/persistence/prisma-ingestion-worker-connection";
import { composeCollectionScanExecution, type CollectionScanExecution } from "./collection-scan-execution";
import { ProductionCollectionScanJobReporter } from "./production-collection-scan-job-reporter";

describe("collection scan execution composition", () => {
  const connection = {} as PrismaIngestionWorkerConnection;
  const ids = new CryptoIdGenerator();
  const clock = new SystemClock();

  it("preserves the live adapters and execution identifiers by default", () => {
    const execution = composeCollectionScanExecution(connection, ids, clock);
    expect(execution.scanCursors).toBeInstanceOf(PrismaScanCursorRepository);
    expect(execution.reporter).toBeInstanceOf(ProductionCollectionScanJobReporter);
    expect(execution.correlationId).toBe("reader-summary-clean-real-day-collection");
    expect(execution.causationId).toBe("manual-clean-real-day-proof");
  });

  it("uses the complete explicit boundary without consulting live cursor storage", async () => {
    const liveCursor = { findFirst: jest.fn(), upsert: jest.fn() };
    const scopedConnection = { cursorCheckpoint: liveCursor } as unknown as PrismaIngestionWorkerConnection;
    const scope = { tenantId: tenantId("tenant-a"), workspaceId: workspaceId("workspace-a"), sourceBindingId: "binding-a" };
    const isolated = new IsolatedScanCursorRepository(scope);
    const reporter: CollectionScanExecution["reporter"] = {
      reportSucceeded: jest.fn(async () => undefined),
      reportFailed: jest.fn(async () => undefined),
    };
    const explicit: CollectionScanExecution = {
      scanCursors: isolated,
      reporter,
      scanJobIdForAttempt: () => "recovery-attempt-a",
      correlationId: "recovery-run-a",
      causationId: "recovery-request-a",
    };
    const execution = composeCollectionScanExecution(scopedConnection, ids, clock, explicit);
    expect(execution).toBe(explicit);
    expect(execution.scanCursors).toBe(isolated);
    expect(execution.scanJobIdForAttempt({ ...scope, scanPolicyId: "policy-a" })).toBe("recovery-attempt-a");
    expect(await execution.scanCursors.findBySourceBinding(scope)).toBeNull();
    await execution.scanCursors.save({ ...scope, cursor: "etag-a", committedAt: new Date("2026-09-01T00:00:00Z") });
    expect((await execution.scanCursors.findBySourceBinding(scope))?.cursor).toBe("etag-a");
    expect(liveCursor.findFirst).not.toHaveBeenCalled();
    expect(liveCursor.upsert).not.toHaveBeenCalled();
  });

  it("rejects an incomplete explicit boundary instead of falling back to live adapters", () => {
    expect(() => composeCollectionScanExecution(connection, ids, clock, {
      scanCursors: new IsolatedScanCursorRepository({
        tenantId: tenantId("tenant-a"),
        workspaceId: workspaceId("workspace-a"),
        sourceBindingId: "binding-a",
      }),
    } as CollectionScanExecution)).toThrow("boundary is incomplete");
  });
});
