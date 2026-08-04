import {
  currentDatabaseAccess,
  type DatabaseAccess,
} from "@social-monitor/platform-persistence";

import {
  discoverCanonicalReaderSummaryDailyMaintenanceTargets,
  readerSummaryDailyMaintenanceScope,
} from "./reader-summary-daily-maintenance-scope";

describe("reader summary daily maintenance scope", () => {
  it("accepts only the canonical tenant/workspace scope", async () => {
    const targets = [
      { ...readerSummaryDailyMaintenanceScope, providerKey: "reddit" },
      { ...readerSummaryDailyMaintenanceScope, providerKey: "rss" },
    ];
    let observedAccess: DatabaseAccess | undefined;

    await expect(
      discoverCanonicalReaderSummaryDailyMaintenanceTargets(async () => {
        observedAccess = currentDatabaseAccess();
        return targets;
      }),
    ).resolves.toBe(targets);

    expect(observedAccess).toEqual({
      kind: "system",
      reason: "clean real-day enabled provider target discovery",
    });
    expect(currentDatabaseAccess()).toBeUndefined();
  });

  it("rejects a fallback scope before collection can start", async () => {
    await expect(
      discoverCanonicalReaderSummaryDailyMaintenanceTargets(async () => [
        {
          tenantId: "00000000-0000-7000-8000-000000006101",
          workspaceId: "00000000-0000-7000-8000-000000006102",
        },
      ]),
    ).rejects.toThrow("canonical daily maintenance tenant/workspace scope");
  });

  it("rejects a mixed canonical and fallback discovery result", async () => {
    await expect(
      discoverCanonicalReaderSummaryDailyMaintenanceTargets(async () => [
        readerSummaryDailyMaintenanceScope,
        {
          tenantId: "00000000-0000-7000-8000-000000006101",
          workspaceId: "00000000-0000-7000-8000-000000006102",
        },
      ]),
    ).rejects.toThrow("canonical daily maintenance tenant/workspace scope");
  });
});
