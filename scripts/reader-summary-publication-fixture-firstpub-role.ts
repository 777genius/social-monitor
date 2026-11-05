import assert from "node:assert/strict";
import type { Pool, PoolClient } from "pg";

export const publicationFixtureFirstPublicationRole = "social_monitor_summary_once";
export type PublicationFixtureFirstPublicationRoleOwnership = Readonly<{ oid: number }>;

// A role name or an initial absence snapshot is not evidence of ownership.
// Retain the identity only after this fixture's CREATE transaction commits.
const inspectRole = (client: PoolClient) => client.query<{
  oid: number; safe: boolean;
}>(`SELECT role.oid, NOT role.rolcanlogin AND NOT role.rolsuper
    AND NOT role.rolcreatedb AND NOT role.rolcreaterole AND NOT role.rolinherit
    AND NOT role.rolreplication AND NOT role.rolbypassrls
    AND role.rolconfig IS NULL AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_auth_members membership
      WHERE membership.member = role.oid OR membership.roleid = role.oid
    ) AS safe FROM pg_catalog.pg_roles role WHERE role.rolname = $1`,
  [publicationFixtureFirstPublicationRole]);

export async function provisionPublicationFixtureFirstPublicationRole(
  serverAdmin: Pool,
): Promise<PublicationFixtureFirstPublicationRoleOwnership> {
  const client = await serverAdmin.connect();
  try {
    await client.query("BEGIN");
    const existing = await inspectRole(client);
    if (existing.rows.length > 0) {
      assert(existing.rows[0]?.safe === true, "pre-existing first publication fixture role is unsafe");
      throw new Error("refusing pre-existing first publication fixture role: not owned by this fixture");
    }
    // No grant to the migrator or ordinary runtime: the finite capability is
    // closed, separately provisioned, and never an owner/schema-owner member.
    await client.query(`CREATE ROLE social_monitor_summary_once
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT
      NOREPLICATION NOBYPASSRLS`);
    const created = await inspectRole(client);
    const role = created.rows[0];
    assert(created.rows.length === 1 && role?.safe === true,
      "created first publication fixture role is unsafe");
    assert(Number.isInteger(role.oid) && role.oid > 0, "first publication fixture role identity is missing");
    await client.query("COMMIT");
    return Object.freeze({ oid: role.oid });
  } catch (error: unknown) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Called only after the owned database has been successfully dropped.
 * DROP ROLE itself refuses dependencies in any remaining database. Never
 * remove foreign ACLs/objects with DROP OWNED or disguise uncertainty. */
export async function dropPublicationFixtureFirstPublicationRole(
  serverAdmin: Pool,
  ownership: PublicationFixtureFirstPublicationRoleOwnership,
): Promise<void> {
  const client = await serverAdmin.connect();
  try {
    await client.query("BEGIN");
    const current = await inspectRole(client);
    assert(current.rows.length === 1 && current.rows[0]?.oid === ownership.oid,
      "first publication fixture role ownership is uncertain");
    assert(current.rows[0].safe === true, "owned first publication fixture role has unsafe changes");
    await client.query("DROP ROLE social_monitor_summary_once");
    await client.query("COMMIT");
  } catch (error: unknown) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
