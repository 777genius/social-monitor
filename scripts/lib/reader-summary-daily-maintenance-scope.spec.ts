import {
  currentDatabaseAccess,
  runWithSystemDatabaseAccess,
  runWithTenantDatabaseAccess,
  type DatabaseAccess,
} from "@social-monitor/platform-persistence";

import {
  discoverCanonicalReaderSummaryDailyMaintenanceTargets,
  discoverReaderSummaryProductionHistoryTargets,
  readerSummaryDailyMaintenanceScope,
  readerSummaryProductionHistoryScope,
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

  describe("production scheduled discovery", () => {
    it("runs with the exact canonical tenant access and returns canonical targets", async () => {
      const targets = [
        { ...readerSummaryProductionHistoryScope, providerKey: "reddit" },
        { ...readerSummaryProductionHistoryScope, providerKey: "rss" },
      ];
      let observedAccess: DatabaseAccess | undefined;

      await expect(
        discoverReaderSummaryProductionHistoryTargets(async () => {
          observedAccess = currentDatabaseAccess();
          expect(observedAccess?.kind).not.toBe("system");
          return targets;
        }),
      ).resolves.toBe(targets);

      expect(observedAccess).toEqual({
        kind: "tenant",
        ...readerSummaryProductionHistoryScope,
      });
      expect(currentDatabaseAccess()).toBeUndefined();
    });

    it.each([
      { name: "empty", targets: [] },
      {
        name: "wrong tenant",
        targets: [
          {
            ...readerSummaryProductionHistoryScope,
            tenantId: readerSummaryDailyMaintenanceScope.tenantId,
          },
        ],
      },
      {
        name: "wrong workspace",
        targets: [
          {
            ...readerSummaryProductionHistoryScope,
            workspaceId: readerSummaryDailyMaintenanceScope.workspaceId,
          },
        ],
      },
      {
        name: "mixed",
        targets: [
          readerSummaryProductionHistoryScope,
          readerSummaryDailyMaintenanceScope,
        ],
      },
    ])("rejects $name results without leaking context", async ({ targets }) => {
      await expect(
        discoverReaderSummaryProductionHistoryTargets(async () => targets),
      ).rejects.toThrow("production history tenant/workspace scope");
      expect(currentDatabaseAccess()).toBeUndefined();
    });

    it("does not leak tenant access when discovery fails", async () => {
      await expect(
        discoverReaderSummaryProductionHistoryTargets(async () => {
          expect(currentDatabaseAccess()).toEqual({
            kind: "tenant",
            ...readerSummaryProductionHistoryScope,
          });
          throw new Error("discovery failed");
        }),
      ).rejects.toThrow("discovery failed");
      expect(currentDatabaseAccess()).toBeUndefined();
    });

    it("rejects conflicting outer access before invoking discovery", async () => {
      const discover = jest.fn(async () => [
        readerSummaryProductionHistoryScope,
      ]);

      await expect(
        runWithSystemDatabaseAccess("outer system operation", () =>
          discoverReaderSummaryProductionHistoryTargets(discover),
        ),
      ).rejects.toThrow("Nested database access scope cannot change");
      expect(discover).not.toHaveBeenCalled();
      expect(currentDatabaseAccess()).toBeUndefined();

      await expect(
        runWithTenantDatabaseAccess(readerSummaryDailyMaintenanceScope, () =>
          discoverReaderSummaryProductionHistoryTargets(discover),
        ),
      ).rejects.toThrow("Nested database access scope cannot change");
      expect(discover).not.toHaveBeenCalled();
      expect(currentDatabaseAccess()).toBeUndefined();
    });
  });
});
