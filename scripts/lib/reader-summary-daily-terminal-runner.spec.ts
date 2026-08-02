import { createHash } from "node:crypto";

import { readerSummaryDailyModelJobIdentity } from "@social-monitor/summary/domain/value-objects/reader-summary-daily-model-job";
import type {
  ReaderSummaryDailyExecutionCursorPort,
  ReaderSummaryDailyExecutionWork,
} from "@social-monitor/summary/ports/reader-summary-daily-execution-cursor.port";

import {
  ReaderSummaryDailyTerminalRunner,
  readerSummaryDailyLeaseRenewalMs,
  type ReaderSummaryDailyRenewalScheduler,
  type ReaderSummaryDailySubscriptionRuntime,
} from "./reader-summary-daily-terminal-runner";

const tenantId = "10000000-0000-4000-8000-000000000001";
const workspaceId = "20000000-0000-4000-8000-000000000002";

describe("ReaderSummaryDailyTerminalRunner", () => {
  it("durably marks RUNNING, calls once, renews at five minutes, and completes", async () => {
    const events: string[] = [];
    const cursor = fakeCursor(work(), events);
    const runtime = fakeRuntime(events);
    const publication = fakePublication(events);
    let renewal: (() => void) | undefined;
    const schedule: ReaderSummaryDailyRenewalScheduler = (callback, intervalMs) => {
      expect(intervalMs).toBe(readerSummaryDailyLeaseRenewalMs);
      renewal = callback;
      queueMicrotask(callback);
      return { stop: () => events.push("stop") };
    };
    const runner = new ReaderSummaryDailyTerminalRunner({
      cursor, runtime, publication,
      now: () => new Date("2026-08-01T01:00:00.000Z"),
      schedule,
    });

    const result = await runner.runOne(input());
    expect(result).toMatchObject({ kind: "completed", requestedUtcDate: "2026-07-31" });
    expect(runtime.run).toHaveBeenCalledTimes(1);
    expect(events).toEqual([
      "claim", "running", "runtime", "renew", "complete", "publish",
      "finalize", "stop",
    ]);
    expect(cursor.renewLease).toHaveBeenCalledTimes(1);
    expect(cursor.complete).toHaveBeenCalledWith(expect.objectContaining({
      completedAt: "2026-08-01T01:00:00.000Z",
    }));
    expect(cursor.finalizePublication).toHaveBeenCalledWith(
      expect.objectContaining({
        finalizedAt: "2026-08-01T01:00:00.000Z",
      }),
    );
    expect(renewal).toBeDefined();
  });

  it("replays exact COMPLETED bytes with zero runtime calls", async () => {
    const events: string[] = [];
    const cursor = fakeCursor(work({
      modelJobState: "COMPLETED",
      completedResponseBytes: Buffer.from("stored-response"),
      completedReceiptBytes: Buffer.from("stored-receipt"),
    }), events);
    const runtime = fakeRuntime(events);
    const publication = fakePublication(events);
    const result = await new ReaderSummaryDailyTerminalRunner({
      cursor, runtime, publication,
      now: () => new Date("2026-08-01T01:00:00.000Z"),
    }).runOne(input());
    expect(result).toMatchObject({ kind: "replayed" });
    expect(runtime.run).not.toHaveBeenCalled();
    expect(cursor.markRunning).not.toHaveBeenCalled();
    expect(publication.publish).toHaveBeenCalledTimes(1);
    expect(cursor.finalizePublication).toHaveBeenCalledTimes(1);
  });

  it.each(["failed_ambiguous", "recovery_required", "leased"] as const)(
    "performs zero calls for %s",
    async (kind) => {
      const cursor = fakeCursor(work(), []);
      cursor.claimNext.mockResolvedValueOnce(kind === "recovery_required"
        ? { kind, nextUnresolvedUtcDate: "2026-07-20", eligibleThrough: "2026-07-31" }
        : { kind, requestedUtcDate: "2026-07-31" });
      const runtime = fakeRuntime([]);
      const publication = fakePublication([]);
      const result = await new ReaderSummaryDailyTerminalRunner({
        cursor, runtime, publication,
        now: () => new Date("2026-08-01T01:00:00.000Z"),
      }).runOne(input());
      expect(result.kind).toBe(kind);
      expect(runtime.run).not.toHaveBeenCalled();
      expect(publication.publish).not.toHaveBeenCalled();
    },
  );

  it("never calls again after an ambiguous runtime failure", async () => {
    const cursor = fakeCursor(work(), []);
    const runtime = fakeRuntime([]);
    const publication = fakePublication([]);
    runtime.run.mockRejectedValueOnce(new Error("outcome unknown"));
    const runner = new ReaderSummaryDailyTerminalRunner({
      cursor, runtime, publication,
      now: () => new Date("2026-08-01T01:00:00.000Z"),
    });
    await expect(runner.runOne(input())).rejects.toThrow("outcome unknown");
    expect(runtime.run).toHaveBeenCalledTimes(1);
    expect(cursor.complete).not.toHaveBeenCalled();
    cursor.claimNext.mockResolvedValueOnce({
      kind: "failed_ambiguous",
      requestedUtcDate: "2026-07-31",
    });
    await expect(runner.runOne(input())).resolves.toMatchObject({
      kind: "failed_ambiguous",
    });
    expect(runtime.run).toHaveBeenCalledTimes(1);
  });

  it("replays a receipt after a publication crash with zero extra provider calls", async () => {
    const events: string[] = [];
    const cursor = fakeCursor(work(), events);
    const runtime = fakeRuntime(events);
    const publication = fakePublication(events);
    publication.publish.mockRejectedValueOnce(new Error("publication crash"));
    const runner = new ReaderSummaryDailyTerminalRunner({
      cursor,
      runtime,
      publication,
      now: () => new Date("2026-08-01T01:00:00.000Z"),
    });

    await expect(runner.runOne(input())).rejects.toThrow("publication crash");
    const completed = cursor.complete.mock.calls[0]?.[0];
    expect(completed).toBeDefined();
    cursor.claimNext.mockResolvedValueOnce({
      kind: "claimed",
      work: work({
        modelJobState: "COMPLETED",
        completedResponseBytes: completed!.responseBytes,
        completedReceiptBytes: completed!.receiptBytes,
      }),
    });

    await expect(runner.runOne(input())).resolves.toMatchObject({
      kind: "replayed",
    });
    expect(runtime.run).toHaveBeenCalledTimes(1);
    expect(publication.publish).toHaveBeenCalledTimes(2);
    expect(cursor.finalizePublication).toHaveBeenCalledTimes(1);
  });

  it("fails before the runtime when the seven-hour absolute cap is reached", async () => {
    const cursor = fakeCursor(work({
      lease: {
        owner: "worker-1", fencingToken: 7n,
        leasedAt: "2026-07-31T18:00:00.000Z",
        expiresAt: "2026-08-01T01:20:00.000Z",
        absoluteExpiresAt: "2026-08-01T01:00:00.000Z",
      },
    }), []);
    const runtime = fakeRuntime([]);
    const publication = fakePublication([]);
    await expect(new ReaderSummaryDailyTerminalRunner({
      cursor, runtime, publication,
      now: () => new Date("2026-08-01T01:00:00.000Z"),
    }).runOne(input())).rejects.toThrow(/seven-hour/u);
    expect(runtime.run).not.toHaveBeenCalled();
  });
});

const input = () => ({ tenantId, workspaceId, workerId: "worker-1", firstUnresolvedUtcDate: "2026-07-31" });

const work = (patch: Partial<ReaderSummaryDailyExecutionWork> = {}): ReaderSummaryDailyExecutionWork => {
  const sourceRecord = {
    schemaVersion: 1, tenantId, workspaceId, requestedUtcDate: "2026-07-31",
    ingestionCutoff: "2026-08-01T00:00:00.000Z", items: [],
  };
  const canonicalBytes = Buffer.from(JSON.stringify(sourceRecord));
  const canonicalSha256 = hash(canonicalBytes);
  return {
    tenantId, workspaceId, requestedUtcDate: "2026-07-31", eligibleThrough: "2026-07-31",
    sourceAuthority: {
      requestedUtcDate: "2026-07-31", ingestionCutoff: sourceRecord.ingestionCutoff,
      canonicalBytes, canonicalSha256,
    },
    modelJob: readerSummaryDailyModelJobIdentity({
      tenantId, workspaceId, requestedUtcDate: "2026-07-31",
      sourceAuthoritySha256: canonicalSha256,
    }),
    modelJobState: "RESERVED",
    lease: {
      owner: "worker-1", fencingToken: 7n,
      leasedAt: "2026-08-01T01:00:00.000Z",
      expiresAt: "2026-08-01T01:20:00.000Z",
      absoluteExpiresAt: "2026-08-01T08:00:00.000Z",
    },
    ...patch,
  };
};

const fakeCursor = (claimed: ReaderSummaryDailyExecutionWork, events: string[]) => ({
  claimNext: jest.fn<
    ReturnType<ReaderSummaryDailyExecutionCursorPort["claimNext"]>,
    Parameters<ReaderSummaryDailyExecutionCursorPort["claimNext"]>
  >(async (input) => { void input; events.push("claim"); return { kind: "claimed", work: claimed }; }),
  renewLease: jest.fn<
    ReturnType<ReaderSummaryDailyExecutionCursorPort["renewLease"]>,
    Parameters<ReaderSummaryDailyExecutionCursorPort["renewLease"]>
  >(async (input) => { void input; events.push("renew"); return claimed.lease; }),
  markRunning: jest.fn<
    ReturnType<ReaderSummaryDailyExecutionCursorPort["markRunning"]>,
    Parameters<ReaderSummaryDailyExecutionCursorPort["markRunning"]>
  >(async (input) => { void input; events.push("running"); }),
  complete: jest.fn<
    ReturnType<ReaderSummaryDailyExecutionCursorPort["complete"]>,
    Parameters<ReaderSummaryDailyExecutionCursorPort["complete"]>
  >(async (input) => { void input; events.push("complete"); }),
  finalizePublication: jest.fn<
    ReturnType<ReaderSummaryDailyExecutionCursorPort["finalizePublication"]>,
    Parameters<ReaderSummaryDailyExecutionCursorPort["finalizePublication"]>
  >(async (input) => { void input; events.push("finalize"); }),
}) satisfies jest.Mocked<ReaderSummaryDailyExecutionCursorPort>;

const fakePublication = (events: string[]) => ({
  publish: jest.fn(async () => {
    events.push("publish");
    return {
      readerSummaryJobId: "30000000-0000-4000-8000-000000000003",
      readerSummaryArtifactId: "40000000-0000-4000-8000-000000000004",
      publicationId: "40000000-0000-4000-8000-000000000004",
      reportSha256: "a".repeat(64), proofSha256: "b".repeat(64),
      weeklyEvidenceSha256: "c".repeat(64),
      publicEvidenceBytes: Buffer.from("evidence"),
      publicEvidenceSha256: hash(Buffer.from("evidence")),
      publicFrontendBytes: Buffer.from("frontend"),
      publicFrontendSha256: hash(Buffer.from("frontend")),
    };
  }),
});

const fakeRuntime = (events: string[]) => ({
  runtimeEngine: "subscription-runtime-cli" as const,
  run: jest.fn<
    ReturnType<ReaderSummaryDailySubscriptionRuntime["run"]>,
    Parameters<ReaderSummaryDailySubscriptionRuntime["run"]>
  >(async (input) => {
    void input;
    events.push("runtime");
    const responseBytes = Buffer.from('{"summary":"ok"}');
    return { responseBytes, executionAttestation: attestation(responseBytes) };
  }),
}) satisfies jest.Mocked<ReaderSummaryDailySubscriptionRuntime>;

const attestation = (responseBytes: Buffer) => ({
  schemaVersion: 1, requestId: "daily-1", purpose: "social_monitor.reader_summary.generate",
  canonicalRequestSha256: "a".repeat(64), provider: "codex", model: "gpt-5.6-sol",
  reasoningEffort: "xhigh", runtimeEngine: "subscription-runtime-cli",
  runtimePackageVersion: "1.2.3", launcherSha256: "b".repeat(64),
  selectedOutputKind: "structured_output", selectedOutputSha256: hash(responseBytes),
});
const hash = (value: Buffer) => createHash("sha256").update(value).digest("hex");
