import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  assertDailyDeliveryC1CaughtUp,
  dailyDeliveryC1AdoptOnlyDates,
  planDailyDeliveryC1,
  writeDailyDeliveryC1RecoveryThroughFile,
} from "./reader-summary-daily-canonical-recovery-v4-delivery-c1";

describe("daily delivery C1 precollect-before-claim plan", () => {
  it("adopts C0 only through terminal projection and attempt-2 receipt proof", () => {
    const source = readFileSync(
      require.resolve("./reader-summary-daily-canonical-recovery-v4-delivery-c1"),
      "utf8",
    );
    expect(source).toContain(
      "read_reader_summary_daily_canonical_recovery_v4_terminals",
    );
    expect(source).toContain(
      "read_reader_summary_daily_delivery_c1_retry_evidence",
    );
    expect(source).not.toContain(
      "LEFT JOIN public.reader_summary_daily_canonical_recovery_v4_ambiguity_retries",
    );
    expect(source).toContain("retry.attempt_ordinal=2");
    expect(source).not.toContain("reader_summary_recovery_receipts");
  });

  it("opens every tenant read in a scoped serializable read-only transaction", () => {
    const source = readFileSync(
      require.resolve("./reader-summary-daily-canonical-recovery-v4-delivery-c1"),
      "utf8",
    );
    expect(source).toContain("BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY");
    expect(source).toContain("set_config('social_monitor.tenant_id'");
    expect(source).toContain("set_config('social_monitor.workspace_id'");
    expect(source).toContain(
      "set_config('social_monitor.system_access', 'false', true)",
    );
  });

  it("writes rolling immutable receipts over exact publication bindings", () => {
    const source = readFileSync(
      require.resolve("./reader-summary-daily-canonical-recovery-v4-delivery-c1"),
      "utf8",
    );
    expect(source).toContain(
      "reader-summary-daily-delivery-caught-up-c1-${input.yesterdayUtcDate}.json",
    );
    expect(source).toContain("JSON.stringify(publications)");
    expect(source).toContain(
      "reader-summary-daily-delivery-caught-up-c1-latest.json",
    );
    expect(source).toContain("renameSync(staged, latest)");
  });

  it("recovers an absent cursor from Jul23 through DB UTC yesterday", () => {
    expect(
      planDailyDeliveryC1({
        nextUnresolvedUtcDate: null,
        yesterdayUtcDate: "2026-07-26",
        publishedDates: ["2026-07-25", "2026-07-26"],
      }),
    ).toEqual([
      { requestedUtcDate: "2026-07-23", disposition: "precollect" },
      { requestedUtcDate: "2026-07-24", disposition: "precollect" },
      { requestedUtcDate: "2026-07-25", disposition: "adopt_c0" },
      { requestedUtcDate: "2026-07-26", disposition: "adopt_c0" },
    ]);
  });

  it("pins the D-bound C0 adoption set to Jul25-Jul30", () => {
    expect(dailyDeliveryC1AdoptOnlyDates).toEqual([
      "2026-07-25",
      "2026-07-26",
      "2026-07-27",
      "2026-07-28",
      "2026-07-29",
      "2026-07-30",
    ]);
  });

  it("does not report CAUGHT_UP until every required publication is proven", () => {
    expect(() =>
      assertDailyDeliveryC1CaughtUp({
        nextUnresolvedUtcDate: "2026-07-26",
        yesterdayUtcDate: "2026-07-25",
        publishedDates: ["2026-07-23", "2026-07-25"],
      }),
    ).toThrow("missing published days: 2026-07-24");
    expect(() =>
      assertDailyDeliveryC1CaughtUp({
        nextUnresolvedUtcDate: null,
        yesterdayUtcDate: "2026-07-25",
        publishedDates: ["2026-07-23", "2026-07-24", "2026-07-25"],
      }),
    ).toThrow("cursor must equal 2026-07-26");
    expect(() =>
      assertDailyDeliveryC1CaughtUp({
        nextUnresolvedUtcDate: "2026-07-26",
        yesterdayUtcDate: "2026-07-25",
        publishedDates: ["2026-07-23", "2026-07-24", "2026-07-25"],
      }),
    ).not.toThrow();
  });

  it("hands off one strict frozen boundary before collection", () => {
    const directory = mkdtempSync(join(tmpdir(), "daily-c1-boundary-"));
    const path = join(directory, "recovery-through");
    try {
      writeDailyDeliveryC1RecoveryThroughFile(path, "2026-08-10");
      expect(readFileSync(path, "utf8")).toBe("2026-08-10\n");
      expect(() =>
        writeDailyDeliveryC1RecoveryThroughFile(path, "2026-08-11"),
      ).toThrow("EEXIST");
      expect(() =>
        writeDailyDeliveryC1RecoveryThroughFile(
          join(directory, "malformed"),
          "2026-8-10",
        ),
      ).toThrow("recovery-through date is invalid");
      writeFileSync(join(directory, "unrelated"), "not-a-boundary");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
