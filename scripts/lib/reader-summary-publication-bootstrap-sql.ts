import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** Expand the one reviewed bootstrap responsibility exactly as psql's relative
 * include does. No arbitrary include paths or recursive loader language. */
export function readPublicationBootstrapSql(path: string): string {
  const ownership = "reader-summary-publication-tenant-ownership.sql";
  const sql = readFileSync(path, "utf8")
    .replace(/^\\ir reader-summary-publication-tenant-ownership\.sql\r?$/gm,
      () => readFileSync(join(dirname(path), "../../scripts/sql", ownership), "utf8"))
    .replace(/^\\set[^\n]*\n/gm, "");
  if (/^\s*\\/m.test(sql)) throw new Error("Unsupported publication bootstrap SQL directive");
  return sql;
}
