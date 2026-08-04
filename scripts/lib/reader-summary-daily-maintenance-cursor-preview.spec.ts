import {
  readReaderSummaryDailyMaintenanceCursorPreview,
} from "./reader-summary-daily-maintenance-cursor-preview";
import {
  readerSummaryDailyMaintenanceScope,
} from "./reader-summary-daily-maintenance-scope";

describe("daily maintenance cursor preview", () => {
  it("reads the exact canonical scope before any bounded claim", async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [{ nextUnresolvedUtcDate: "2026-08-02" }],
    });

    await expect(readReaderSummaryDailyMaintenanceCursorPreview({
      reader: { query },
      scope: readerSummaryDailyMaintenanceScope,
      firstUnresolvedUtcDate: "2026-07-31",
    })).resolves.toEqual({ nextUnresolvedUtcDate: "2026-08-02" });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("reader_summary_daily_execution_cursors"),
      [
        "00000000-0000-7000-8000-000000000901",
        "00000000-0000-7000-8000-000000000902",
      ],
    );
  });

  it("uses the explicit lower-bound seed only when the scoped cursor is absent", async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });

    await expect(readReaderSummaryDailyMaintenanceCursorPreview({
      reader: { query },
      scope: readerSummaryDailyMaintenanceScope,
      firstUnresolvedUtcDate: "2026-07-31",
    })).resolves.toEqual({ nextUnresolvedUtcDate: "2026-07-31" });
  });

  it("rejects a fallback scope before it can query the cursor", async () => {
    const query = jest.fn();

    await expect(readReaderSummaryDailyMaintenanceCursorPreview({
      reader: { query },
      scope: {
        tenantId: "00000000-0000-7000-8000-000000006101",
        workspaceId: "00000000-0000-7000-8000-000000006102",
      } as never,
      firstUnresolvedUtcDate: "2026-07-31",
    })).rejects.toThrow("scope is not canonical");
    expect(query).not.toHaveBeenCalled();
  });
});
