import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { ScanAttempt } from "../../domain";
import { decideScanAttemptExecution } from "./scan-attempt-idempotency";

const startedAttempt = (attemptNumber: number): ScanAttempt =>
  ScanAttempt.start({
    scanJobId: "scan-job-1",
    tenantId: tenantId("tenant-1"),
    workspaceId: workspaceId("workspace-1"),
    sourceBindingId: "binding-1",
    attemptNumber,
    startedAt: new Date("2026-07-23T12:00:00.000Z"),
  });

describe("decideScanAttemptExecution", () => {
  it("replays a successful attempt without starting execution again", () => {
    const existing = startedAttempt(1).succeed({
      finishedAt: new Date("2026-07-23T12:01:00.000Z"),
      fetched: 4,
      inserted: 3,
      skippedDuplicates: 1,
      projected: 3,
    });

    expect(
      decideScanAttemptExecution({
        existing,
        requestedAttemptNumber: 1,
      }),
    ).toEqual({
      kind: "replay",
      result: {
        scanJobId: "scan-job-1",
        fetched: 4,
        inserted: 3,
        skippedDuplicates: 1,
        projected: 3,
        warnings: [],
      },
    });
  });

  it("rejects a duplicate failed attempt", () => {
    const existing = startedAttempt(1).fail({
      finishedAt: new Date("2026-07-23T12:01:00.000Z"),
      failureReason: "provider unavailable",
    });

    expect(
      decideScanAttemptExecution({
        existing,
        requestedAttemptNumber: 1,
      }).kind,
    ).toBe("reject");
  });

  it("allows the next attempt and a crashed running attempt reclaim", () => {
    const failed = startedAttempt(1).fail({
      finishedAt: new Date("2026-07-23T12:01:00.000Z"),
      failureReason: "provider unavailable",
    });

    expect(
      decideScanAttemptExecution({
        existing: failed,
        requestedAttemptNumber: 2,
      }),
    ).toEqual({ kind: "execute" });
    expect(
      decideScanAttemptExecution({
        existing: startedAttempt(1),
        requestedAttemptNumber: 1,
      }),
    ).toEqual({ kind: "execute" });
  });
});
