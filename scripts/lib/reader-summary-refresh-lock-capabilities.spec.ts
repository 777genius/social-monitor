import { readFileSync } from "node:fs";
import { refreshDates, refreshScope } from "./reader-summary-new-input-refresh-manifest";
import { readPublicationBootstrapSql } from "./reader-summary-publication-bootstrap-sql";

const migrationPath = "prisma/migrations/20260909120000_reader_summary_refresh_lock_capabilities/migration.sql";
const sql = readFileSync(migrationPath, "utf8");
const ownershipPath = "ops/deploy/reader-summary-publication-tenant-ownership.sql";
const ownership = readFileSync(ownershipPath, "utf8");
const prePath = "ops/deploy/reader-summary-publication-pre-migration.sql";
const postPath = "ops/deploy/reader-summary-publication-post-migration.sql";

// Source contracts complement orchestrator-owned native ACL/lock tests. They do
// not simulate PostgreSQL privileges or claim physical concurrency coverage.
describe("fixed successor lock SQL contract", () => {
  it.each([
    ["publication_ledgers", "social_monitor_reader_summary_publication_owner",
      "public.reader_summary_publications, public.reader_summary_publication_slots"],
    ["reconciliation", "social_monitor_public_schema_owner",
      "public.reader_summary_new_input_refresh_reconciliations"],
  ])("contains %s under its own owner with no caller-selected lock surface", (name, owner, relations) => {
    const functionName = `public.lock_reader_summary_refresh_${name}`;
    const start = sql.indexOf(`CREATE FUNCTION ${functionName}(`);
    const end = sql.indexOf("RESET ROLE;", start);
    const definition = sql.slice(start, end);
    expect(sql.slice(0, start).trimEnd()).toMatch(new RegExp(`SET LOCAL ROLE ${owner};$`));
    expect(definition).toContain("target_tenant_id uuid, target_workspace_id uuid, target_date date");
    expect(definition).toContain("RETURNS boolean");
    expect(definition).toContain("LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE");
    expect(definition).toContain("SET search_path = pg_catalog\n");
    const body = definition.split("AS $function$\n")[1]!.split("$function$;")[0]!;
    expect(body).not.toMatch(/\b(?:EXECUTE|INSERT|UPDATE|DELETE|TRUNCATE|EXCEPTION WHEN|STRICT)\b/);
    expect(body.match(/LOCK TABLE .+ IN SHARE MODE NOWAIT;/g)).toEqual([
      `LOCK TABLE ${relations} IN SHARE MODE NOWAIT;`,
    ]);
    expect(body.indexOf("RAISE EXCEPTION")).toBeLessThan(body.indexOf("LOCK TABLE"));
    expect(body.slice(body.indexOf("LOCK TABLE"))).toBe(
      `LOCK TABLE ${relations} IN SHARE MODE NOWAIT;\n  RETURN true;\nEND\n`,
    );
    for (const parameter of ["target_tenant_id", "target_workspace_id", "target_date"]) {
      expect(body).toContain(`${parameter} IS NULL`);
    }
    expect(body).toContain(`target_tenant_id <> '${refreshScope.tenantId}'::uuid`);
    expect(body).toContain(`target_workspace_id <> '${refreshScope.workspaceId}'::uuid`);
    expect([...body.matchAll(/DATE '(\d{4}-\d{2}-\d{2})'/g)].map((match) => match[1]))
      .toEqual(refreshDates);
    expect(body).toContain("target_date NOT IN (");
    for (const scope of ["tenant", "workspace"]) {
      expect(body).toContain(`pg_catalog.current_setting('social_monitor.${scope}_id', true)\n` +
        `      IS DISTINCT FROM target_${scope}_id::text`);
    }
    expect(body).toContain("COALESCE(pg_catalog.current_setting('social_monitor.system_access', true), '')\n" +
      "      NOT IN ('', 'false')");
    expect(body).toContain("NOT pg_catalog.pg_has_role(session_user,\n" +
      "      'social_monitor_reader_summary_publication_runtime', 'USAGE')");
    expect(body).not.toMatch(/current_user|social_monitor_rls_workspace_match|social_monitor_rls_system_access/);
    expect(body).toContain("USING ERRCODE = '42501'");
    expect(definition).toContain(`REVOKE ALL ON FUNCTION ${functionName}(uuid, uuid, date) FROM PUBLIC;`);
    expect(definition).toContain(`GRANT EXECUTE ON FUNCTION ${functionName}(uuid, uuid, date)\n` +
      "  TO social_monitor_reader_summary_publication_runtime;");
    expect(definition).not.toContain("WITH GRANT OPTION");
  });

  it("makes creation, default-ACL audit and temporary CREATE cleanup atomic", () => {
    expect(sql.indexOf("BEGIN;")).toBeLessThan(sql.indexOf("GRANT USAGE, CREATE"));
    expect(sql.match(/CREATE FUNCTION/g)).toHaveLength(2);
    expect(sql.match(/^COMMIT;$/gm)).toHaveLength(1);
    expect(sql.trimEnd()).toMatch(/\$refresh_lock_capability_audit\$;\nCOMMIT;$/);
    expect(sql).toContain("REVOKE CREATE ON SCHEMA public FROM social_monitor_reader_summary_publication_owner;");
    expect(sql).toContain("pg_catalog.aclexplode(routine.proacl)");
    expect(sql).toContain("acl.is_grantable");
    expect(sql).toContain("routine.proowner <> capability.owner_name::pg_catalog.regrole");
    expect(sql).not.toMatch(/GRANT social_monitor_\w+ TO|CASCADE|ALTER TABLE|DROP TABLE/);
  });
});

describe("reconciliation bootstrap replay parity", () => {
  it("runs the identical ACL repair in the forward migration and pre bootstrap", () => {
    const repair = (source: string) => source.match(/DO \$refresh_reconciliation_acl\$[\s\S]+?\$refresh_reconciliation_acl\$;/)![0];
    expect(repair(sql)).toBe(repair(ownership));
    expect(repair(sql)).toContain("REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER");
    expect(repair(sql)).toContain("pg_catalog.aclexplode(relation.relacl)");
    expect(repair(sql)).toContain("pg_catalog.aclexplode(a.attacl)");
    expect(repair(sql)).toContain("GRANT SELECT, INSERT ON TABLE public.%I TO ");
    expect(repair(sql)).toContain("NOT IN (0, 2)");
    expect(repair(sql)).not.toMatch(/(?:INSERT INTO|UPDATE public\.|DELETE FROM|TRUNCATE TABLE)/);
    const regrant = ownership.slice(ownership.lastIndexOf("FOR v_relation IN"), ownership.indexOf("$tenant_table_ownership_transfer$;"));
    for (const table of ["reader_summary_new_input_refresh_reconciliations", "reader_summary_new_input_refresh_reconciliation_counters"]) {
      expect(regrant).toContain(`AND relation.relname <> '${table}'`);
    }
    expect(ownership).toContain("THEN 'GRANT SELECT, INSERT ON TABLE public.%I TO %I'");
    // Post bootstrap does not restore a generic DML grant on schema-owned tables.
    expect(readFileSync(postPath, "utf8")).not.toMatch(/GRANT[^;]+(?:ALL TABLES|refresh_reconciliation)/);
  });

  it("expands exactly the same reviewed relative include for Node and shell production", () => {
    const pre = readFileSync(prePath, "utf8");
    const expanded = pre.replace("\\ir reader-summary-publication-tenant-ownership.sql", ownership)
      .replace(/^\\set[^\n]*\n/gm, "");
    expect(readPublicationBootstrapSql(prePath)).toBe(expanded);
    expect(readPublicationBootstrapSql(prePath)).not.toMatch(/^\s*\\/m);
    expect(readPublicationBootstrapSql(postPath)).toBe(
      readFileSync(postPath, "utf8").replace(/^\\set[^\n]*\n/gm, ""),
    );
    const shell = readFileSync("ops/deploy/reader-summary-publication-deploy-lib.sh", "utf8");
    expect(shell).toContain('[[ -f $ownership_sql && ! -L $ownership_sql ]] || return 64');
    expect(shell).toContain('$ownership_sql:/run/social-monitor-db/reader-summary-publication-tenant-ownership.sql:ro');
    expect(shell).toContain("--file=/run/social-monitor-db/publication-migration.sql");
    for (const loader of ["social-monitor-production-deploy.sh", "production-backend-classification-lib.sh"]) {
      expect(readFileSync(`ops/deploy/${loader}`, "utf8")).toContain(ownershipPath);
    }
  });
});
