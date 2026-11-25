import { runWithSystemDatabaseAccess } from "@social-monitor/platform-persistence";

const readerSummaryProductionScope = {
  tenantId: "00000000-0000-7000-8000-000000006101",
  workspaceId: "00000000-0000-7000-8000-000000006102",
} as const;

/** Compatibility selector for the normal, unbounded daily timer. */
export const discoverSingleScopeCleanRealDayTargets = async <
  Target extends Readonly<{ tenantId: string; workspaceId: string }>,
>(discover: () => Promise<readonly Target[]>): Promise<readonly Target[]> => {
  const targets = await runWithSystemDatabaseAccess(
    "clean real-day enabled provider target discovery",
    discover,
  );
  const scopes = new Set(
    targets.map((target) => `${target.tenantId}\u0000${target.workspaceId}`),
  );
  if (scopes.size === 1) return targets;

  const productionTargets = targets.filter(
    (target) =>
      target.tenantId === readerSummaryProductionScope.tenantId &&
      target.workspaceId === readerSummaryProductionScope.workspaceId,
  );
  if (productionTargets.length > 0) return productionTargets;
  throw new Error(
    `Clean real-day target discovery expected exactly one tenant/workspace scope, found ${scopes.size}`,
  );
};
