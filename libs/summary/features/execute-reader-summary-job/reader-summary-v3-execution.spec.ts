import { FixedClock, tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { ReaderSummaryJob, type ReaderSummaryPreparationManifest } from "../../domain";
import type { ReaderSummaryJobRepositoryPort } from "../../ports";
import { buildReaderSummaryV3Evidence, prepareReaderSummaryV3Job } from
  "./reader-summary-v3-execution";

describe("reader summary V3 execution provenance", () => {
  it("returns requested for deferred preparation", async () => {
    const job = requestedV3Job();

    const result = await prepareReaderSummaryV3Job({
      job,
      preflight: { advance: async () => ({ kind: "deferred", job }) },
      clock: new FixedClock(now),
    });

    expect(result).toEqual({ kind: "result", value: {
      readerSummaryJobId: job.toSnapshot().id,
      status: "requested",
      readerSummaryId: undefined,
    } });
  });

  it("returns running for a duplicate delivery already claimed by a peer", async () => {
    const requested = requestedV3Job();
    const running = ReaderSummaryJob.rehydrate({
      ...requested.toSnapshot(),
      status: "running",
      startedAt: now,
      preparationReadyAt: now,
      preparationManifest: manifest,
    });

    const result = await prepareReaderSummaryV3Job({
      job: requested,
      preflight: { advance: async () => ({ kind: "already_running", job: running }) },
      clock: new FixedClock(now),
    });

    expect(result).toEqual({ kind: "result", value: {
      readerSummaryJobId: running.toSnapshot().id,
      status: "running",
    } });
  });

  it("retains the exact microsecond cutoff for no-signal evidence", async () => {
    const period = { cadence: "daily" as const,
      startedAt: new Date("2026-09-20T00:00:00.000Z"), endedAt: now,
      timezone: "UTC",
      periodKey: "daily:2026-09-20T00:00:00.000Z:2026-09-21T00:00:00.000Z:UTC" };
    const job = ReaderSummaryJob.request({ id: id(1), tenantId: tenantId(id(2)),
      workspaceId: workspaceId(id(3)), scope: { type: "interest", interestId: id(4) },
      period, idempotencyKey: "v3-no-signal", requestedAt: now,
      selectionStrategy: "legacy_v2" }).start({ startedAt: now });
    const result = await buildReaderSummaryV3Evidence({ job, manifest,
      promotion: { build: async () => ({ kind: "no_signal" }) },
      jobs: {} as ReaderSummaryJobRepositoryPort, clock: new FixedClock(now),
      claimStartedAt: now });

    expect(result.kind).toBe("evidence");
    if (result.kind !== "evidence") return;
    expect(result.evidence.sourceWindow.ingestionCutoff?.toISOString())
      .toBe("2026-09-20T23:59:59.123Z");
    expect(result.evidence.sourceWindow.exactIngestionCutoff)
      .toBe("2026-09-20T23:59:59.123456Z");
  });
});

const now = new Date("2026-09-21T00:00:00.000Z");
const manifest: ReaderSummaryPreparationManifest = {
  schemaVersion: "reader_summary_preparation_manifest.v1",
  cutoffAt: "2026-09-20T23:59:59.123456Z", interestSha256: "1".repeat(64),
  rubricSha256: "2".repeat(64), inputBuilderVersion: "input.v1",
  modelConfigVersion: "jev.v1", candidates: [],
};

const requestedV3Job = (): ReaderSummaryJob => ReaderSummaryJob.request({
  id: id(1),
  tenantId: tenantId(id(2)),
  workspaceId: workspaceId(id(3)),
  scope: { type: "interest", interestId: id(4) },
  period: { cadence: "daily", startedAt: new Date("2026-09-20T00:00:00.000Z"),
    endedAt: now, timezone: "UTC",
    periodKey: "daily:2026-09-20T00:00:00.000Z:2026-09-21T00:00:00.000Z:UTC" },
  idempotencyKey: "v3-preparation",
  requestedAt: now,
  selectionStrategy: "jev_primary_v3",
});

const id = (ordinal: number): string =>
  `00000000-0000-4000-8000-${String(ordinal).padStart(12, "0")}`;
