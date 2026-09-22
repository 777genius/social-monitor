import { FixedClock, tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { ReaderSummaryJob, type ReaderSummaryPreparationManifest } from "../../domain";
import type { ReaderSummaryJobRepositoryPort } from "../../ports";
import { buildReaderSummaryV3Evidence } from "./reader-summary-v3-execution";

describe("reader summary V3 execution provenance", () => {
  it("retains the exact microsecond cutoff for no-signal evidence", async () => {
    const now = new Date("2026-09-21T00:00:00.000Z");
    const period = { cadence: "daily" as const,
      startedAt: new Date("2026-09-20T00:00:00.000Z"), endedAt: now,
      timezone: "UTC",
      periodKey: "daily:2026-09-20T00:00:00.000Z:2026-09-21T00:00:00.000Z:UTC" };
    const job = ReaderSummaryJob.request({ id: id(1), tenantId: tenantId(id(2)),
      workspaceId: workspaceId(id(3)), scope: { type: "interest", interestId: id(4) },
      period, idempotencyKey: "v3-no-signal", requestedAt: now,
      selectionStrategy: "legacy_v2" }).start({ startedAt: now });
    const manifest: ReaderSummaryPreparationManifest = {
      schemaVersion: "reader_summary_preparation_manifest.v1",
      cutoffAt: "2026-09-20T23:59:59.123456Z", interestSha256: "1".repeat(64),
      rubricSha256: "2".repeat(64), inputBuilderVersion: "input.v1",
      modelConfigVersion: "jev.v1", candidates: [],
    };

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

const id = (ordinal: number): string =>
  `00000000-0000-4000-8000-${String(ordinal).padStart(12, "0")}`;
