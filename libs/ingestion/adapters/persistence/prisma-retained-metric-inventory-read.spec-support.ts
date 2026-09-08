import type { Row } from "./prisma-retained-metric-inventory";

type Tables = { sources: Row[]; feeds: Row[]; bindings: Row[]; interests: Row[]; catalogs: Row[]; observations: Row[] };

// Relational response emulator, NOT a SQL engine or PostgreSQL conformance proof.
// Validate the statement shape and project its named scalar columns before JSON transport.
export function inventorySqlFake(tables: Tables, onQuery: (args: Row, returned: number) => void) {
  return async <T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T> => {
    const sql = query.join("?");
    if (values.length !== 3 || !sql.includes("ORDER BY f.id ASC LIMIT 1001") || !sql.includes("GROUP BY h.has_regression") ||
      !sql.includes("FROM source s") || !sql.includes("count(*)::text")) throw new Error("Unexpected inventory SQL shape");
    const [tenantId, workspaceId, id] = values;
    const owned = (row: Row) => row.tenantId === tenantId && row.workspaceId === workspaceId;
    const source = tables.sources.find((row) => owned(row) && row.id === id);
    onQuery({ sql, values }, source ? 1 : 0);
    if (!source) return [] as T;
    const sort = (rows: Row[]) => [...rows].sort((a, b) => String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);
    const feeds = sort(tables.feeds.filter((row) => owned(row) && row.sourceItemId === id)).slice(0, 1001);
    const bindingIds = new Set([source.sourceBindingId, ...feeds.map((row) => row.sourceBindingId)]);
    const bindings = sort(tables.bindings.filter((row) => owned(row) && bindingIds.has(row.id)));
    const interests = sort(tables.interests.filter((row) => owned(row) && bindings.some((binding) => binding.interestId === row.id)));
    const catalogs = sort(tables.catalogs.filter((row) => bindings.some((binding) => binding.sourceCatalogEntryId === row.id)));
    const observations = tables.observations.filter((row) => owned(row) && row.sourceItemId === id);
    const counts = [false, true].flatMap((hasRegression) => {
      const count = observations.filter((row) => row.hasRegression === hasRegression).length;
      return count ? [{ hasRegression, count: String(count) }] : [];
    });
    const project = (row: Row, alias: string): Row => Object.fromEntries([...sql.matchAll(new RegExp(`\\b${alias}\\.[a-z_]+ AS "(\\w+)"`, "g"))]
      .map((match) => match[1]!).filter((key) => key in row).map((key) => [key, row[key]]));
    return JSON.parse(JSON.stringify([{ source: project(source, "s"), snapshot: source.engagementSnapshot ? Object.fromEntries(["metricsHash", "lastObservedAt", "lastObservationAt"]
        .map((key) => [key, (source.engagementSnapshot as Row)[key]])) : null,
      feeds: feeds.map((row) => project(row, "f")), bindings: bindings.map((row) => project(row, "b")),
      interests: interests.map((row) => project(row, "i")), catalogs: catalogs.map((row) => project(row, "c")), counts }])) as T;
  };
}
