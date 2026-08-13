import { runWithSystemDatabaseAccess } from "@social-monitor/platform-persistence";

export type ReaderSummaryDailyMaintenanceScope = Readonly<{
  tenantId: string;
  workspaceId: string;
}>;

export const readerSummaryDailyMaintenanceScope: ReaderSummaryDailyMaintenanceScope =
  Object.freeze({
    tenantId: "00000000-0000-7000-8000-000000000901",
    workspaceId: "00000000-0000-7000-8000-000000000902",
  });

export const readerSummaryProductionHistoryScope: ReaderSummaryDailyMaintenanceScope =
  Object.freeze({
    tenantId: "00000000-0000-7000-8000-000000006101",
    workspaceId: "00000000-0000-7000-8000-000000006102",
  });

export const isReaderSummaryDailyMaintenanceScope = (
  value: Readonly<{ tenantId: string; workspaceId: string }>,
): value is ReaderSummaryDailyMaintenanceScope =>
  value.tenantId === readerSummaryDailyMaintenanceScope.tenantId &&
  value.workspaceId === readerSummaryDailyMaintenanceScope.workspaceId;

export const isReaderSummaryProductionHistoryScope = (
  value: Readonly<{ tenantId: string; workspaceId: string }>,
): boolean =>
  value.tenantId === readerSummaryProductionHistoryScope.tenantId &&
  value.workspaceId === readerSummaryProductionHistoryScope.workspaceId;

export const assertReaderSummaryDailyMaintenanceScope: (
  value: Readonly<{ tenantId: string; workspaceId: string }>,
) => asserts value is ReaderSummaryDailyMaintenanceScope = (value) => {
  if (!isReaderSummaryDailyMaintenanceScope(value)) {
    throw new Error("Reader summary daily maintenance scope is not canonical");
  }
};

export const discoverCanonicalReaderSummaryDailyMaintenanceTargets = async <
  Target extends Readonly<{ tenantId: string; workspaceId: string }>,
>(
  discover: () => Promise<readonly Target[]>,
): Promise<readonly Target[]> => {
  const targets = await runWithSystemDatabaseAccess(
    "clean real-day enabled provider target discovery",
    discover,
  );
  if (
    targets.length === 0 ||
    targets.some((target) => !isReaderSummaryDailyMaintenanceScope(target))
  ) {
    throw new Error(
      "Clean real-day target discovery did not return the canonical daily maintenance tenant/workspace scope",
    );
  }
  return targets;
};

export const discoverReaderSummaryProductionHistoryTargets = async <
  Target extends Readonly<{ tenantId: string; workspaceId: string }>,
>(
  discover: () => Promise<readonly Target[]>,
): Promise<readonly Target[]> => {
  const targets = await runWithSystemDatabaseAccess(
    "production history enabled provider target discovery",
    discover,
  );
  if (
    targets.length === 0 ||
    targets.some((target) => !isReaderSummaryProductionHistoryScope(target))
  ) {
    throw new Error(
      "Clean real-day target discovery did not return the production history tenant/workspace scope",
    );
  }
  return targets;
};
