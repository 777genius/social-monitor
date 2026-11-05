export const requiredHistoricalPromotionSystemDatabaseUrl = (
  env: Readonly<Record<string, string | undefined>>,
): string => {
  const value = env.SYSTEM_DATABASE_URL?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(
      "SYSTEM_DATABASE_URL is required for historical promotion RLS authority",
    );
  }
  const url = new URL(value);
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("SYSTEM_DATABASE_URL must be a PostgreSQL DSN");
  }
  return value;
};

type HistoricalPromotionRoleClient = Readonly<{
  $queryRaw<T>(
    strings: TemplateStringsArray,
    ...values: readonly unknown[]
  ): Promise<T>;
}>;

export class HistoricalPromotionSystemRoleError extends Error {}

export const assertHistoricalPromotionSystemRole = async (
  client: HistoricalPromotionRoleClient,
): Promise<void> => {
  const rows = await client.$queryRaw<readonly {
    currentUser: string;
    systemRuntimeMember: boolean;
  }[]>`select current_user as "currentUser", pg_has_role(
    current_user, 'social_monitor_tenant_system_runtime', 'USAGE'
  ) as "systemRuntimeMember"`;
  if (rows.length !== 1 || rows[0]?.systemRuntimeMember !== true) {
    throw new HistoricalPromotionSystemRoleError(
      `Historical promotion RLS preflight rejected database role ${rows[0]?.currentUser ?? "unknown"}`,
    );
  }
};
