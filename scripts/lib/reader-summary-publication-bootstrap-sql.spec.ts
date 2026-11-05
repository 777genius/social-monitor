import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPublicationBootstrapSql } from "./reader-summary-publication-bootstrap-sql";

describe("bounded publication bootstrap include", () => {
  const directive = "\\ir reader-summary-publication-tenant-ownership.sql";
  let root: string;
  let pre: string;
  let ownership: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "publication-packaging-"));
    mkdirSync(join(root, "ops/deploy"), { recursive: true });
    mkdirSync(join(root, "scripts/sql"), { recursive: true });
    pre = join(root, "ops/deploy/pre.sql");
    ownership = join(root, "scripts/sql/reader-summary-publication-tenant-ownership.sql");
    writeFileSync(pre, `${directive}\n`);
    writeFileSync(ownership, "SELECT 1;\n");
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("resolves only the relocated repository include, ignoring a sibling decoy", () => {
    writeFileSync(join(root, "ops/deploy/reader-summary-publication-tenant-ownership.sql"), "SELECT 2;");
    expect(readPublicationBootstrapSql(pre)).toBe("SELECT 1;\n\n");
    expect(readFileSync(ownership, "utf8")).toBe("SELECT 1;\n");
  });
  it("fails when the reviewed include is absent", () => {
    rmSync(ownership);
    expect(() => readPublicationBootstrapSql(pre)).toThrow(/ENOENT/);
  });
  it.each(["\\ir unknown.sql", "\\i reader-summary-publication-tenant-ownership.sql",
    "\\ir ../../unknown.sql", "\\echo unsafe"])("rejects directive %s", (sql) => {
    writeFileSync(pre, sql);
    expect(() => readPublicationBootstrapSql(pre)).toThrow(/Unsupported/);
  });
  it("rejects recursive includes in the ownership SQL", () => {
    writeFileSync(ownership, directive);
    expect(() => readPublicationBootstrapSql(pre)).toThrow(/Unsupported/);
  });
});
