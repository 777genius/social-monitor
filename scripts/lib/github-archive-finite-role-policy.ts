import type { openFiniteOperatorSqlPool,FiniteOperatorSqlClient } from '../import-rss-sep24-verified';
type Pool=ReturnType<typeof openFiniteOperatorSqlPool>;
type PoolClient=FiniteOperatorSqlClient;

type Scope = Readonly<{ tenantId: string; workspaceId: string }>;
type RoleRow = Readonly<{ allowed: boolean }>;
export type RssRoleQuery = (sql: string, values: readonly unknown[]) => Promise<readonly RoleRow[]>;

/** Admission remains the current host authority's responsibility. This checks the
 * authenticated SQL identity, finite server lifetime and installed guard contract;
 * it never switches roles, opens LOGIN or substitutes a caller-supplied receipt.
 * Guard body pin: ed013aab07c72e10beed2098114e2d2146833835/render_guard.py.
 */
const roleSql = `
  WITH stamp AS MATERIALIZED (SELECT pg_catalog.clock_timestamp() AS at)
  SELECT (
    current_user = session_user AND r.rolcanlogin
    AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolcreaterole
    AND NOT r.rolcreatedb AND NOT r.rolreplication
    AND r.rolvaliduntil > stamp.at
    AND ($3::boolean = false OR r.rolvaliduntil >= stamp.at + interval '3 minutes')
    AND r.rolvaliduntil <= stamp.at + interval '30 minutes'
    AND pg_catalog.current_setting('social_monitor.tenant_id', true) = $1
    AND pg_catalog.current_setting('social_monitor.workspace_id', true) = $2
    AND pg_catalog.current_setting('social_monitor.system_access', true) = 'false'
    AND CASE r.rolname
      WHEN 'social_monitor_collection' THEN
        NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'social_monitor_collection_v2')
      WHEN 'social_monitor_collection_v2' THEN
        NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'social_monitor_collection')
        AND (SELECT count(*) = 4 FROM pg_catalog.pg_trigger t
          JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
          JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
          JOIN pg_catalog.pg_proc p ON p.oid = t.tgfoid
          JOIN pg_catalog.pg_language l ON l.oid = p.prolang
          JOIN pg_catalog.pg_roles owner ON owner.oid = c.relowner
          WHERE n.nspname = 'public' AND c.relname IN ('source_items', 'feed_items')
            AND c.relkind = 'r' AND NOT c.relispartition AND c.relrowsecurity AND c.relforcerowsecurity
            AND owner.rolname = 'social_monitor_public_schema_owner' AND n.nspowner = owner.oid
            AND NOT owner.rolcanlogin AND NOT owner.rolsuper AND NOT owner.rolcreaterole
            AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_inherits
              WHERE inhrelid = c.oid OR inhparent = c.oid)
            AND ((t.tgname = 'social_monitor_current_source_rows' AND t.tgtype = 31)
              OR (t.tgname = 'social_monitor_current_source_truncate' AND t.tgtype = 34))
            AND t.tgenabled = 'A' AND NOT t.tgisinternal AND t.tgnargs = 1
            AND t.tgargs = pg_catalog.convert_to(r.oid::text, 'UTF8') || pg_catalog.decode('00', 'hex')
            AND t.tgqual IS NULL AND t.tgconstraint = 0 AND t.tgparentid = 0 AND t.tgattr::text = ''
            AND p.proname = 'social_monitor_current_source_guard' AND p.pronamespace = n.oid
            AND p.proowner = owner.oid AND NOT p.prosecdef AND p.pronargs = 0
            AND p.prorettype = 'pg_catalog.trigger'::pg_catalog.regtype AND p.prokind = 'f'
            AND p.provolatile = 'v' AND NOT p.proisstrict AND p.proparallel = 'u' AND p.prosupport = 0
            AND p.proconfig = ARRAY['search_path=pg_catalog']::text[] AND l.lanname = 'plpgsql'
            AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc, 'UTF8')), 'hex')
              = 'e3baba5e3f65abdebd469c743a6042c0f4f5a28555de952371d6a4c1906d6782'
            AND NOT EXISTS (SELECT 1 FROM pg_catalog.aclexplode(
              COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
              WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'))
      ELSE false
    END
  ) AS allowed
  FROM pg_catalog.pg_roles r CROSS JOIN stamp WHERE r.rolname = current_user`;

export async function assertFiniteGitHubArchiveRole(query: RssRoleQuery, scope: Scope,
  phase: "read" | "write"): Promise<void> {
  const rows = await query(roleSql, [scope.tenantId, scope.workspaceId, phase === "write"]);
  if (rows.length !== 1 || rows[0]?.allowed !== true) {
    throw new Error("Finite collection role is unavailable");
  }
}

/** Same pooled session for identity, transaction-local RLS context and data. */
export async function scopedGitHubArchiveRead<T>(pool: Pick<Pool, "connect">, scope: Scope,
  read: (client: Pick<PoolClient, "query">) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SELECT set_config('social_monitor.tenant_id', $1, true), set_config('social_monitor.workspace_id', $2, true), set_config('social_monitor.system_access', 'false', true)",
      [scope.tenantId, scope.workspaceId]);
    await assertFiniteGitHubArchiveRole(async (sql, values) => (await client.query<RoleRow>(sql, [...values])).rows,
      scope, "read");
    const value = await read(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

export type GitHubArchiveScope=Readonly<{tenantId:string;workspaceId:string;interestId:string;sourceBindingId:string;scanPolicyId:string;correlationId:string}>;
export type GitHubArchiveSourceQuery=Readonly<{mode:'listing';query:string}>;
export function githubArchiveRelationConfigMatches(config:string,query:GitHubArchiveSourceQuery):boolean{try{const c=JSON.parse(config) as Record<string,unknown>;return c.mode==='listing'&&c.query===query.query&&['daily','today'].includes(query.query);}catch{return false;}}
export const scopedGitHubArchiveRelationSql=`
 SELECT 1 FROM tenants t
 JOIN workspaces w ON w.tenant_id=t.id AND w.deleted_at IS NULL
 JOIN interests i ON i.tenant_id=t.id AND i.workspace_id=w.id
 JOIN source_bindings sb ON sb.tenant_id=t.id AND sb.workspace_id=w.id
  AND sb.interest_id=i.id AND sb.status='ENABLED' AND sb.deleted_at IS NULL
 JOIN source_catalog_entries sce ON sce.id=sb.source_catalog_entry_id AND sce.provider_key='github-trending-page'
 JOIN scan_policies sp ON sp.tenant_id=t.id AND sp.workspace_id=w.id AND sp.source_binding_id=sb.id
 WHERE t.id=$1::uuid AND t.deleted_at IS NULL AND w.id=$2::uuid
  AND i.id=$3::uuid AND i.status='ENABLED' AND i.deleted_at IS NULL
  AND sb.id=$4::uuid AND sp.id=$5::uuid AND sb.config=$6::jsonb`;
export async function verifyScopedGitHubArchiveRelation(pool:Pick<Pool,'connect'>,scope:GitHubArchiveScope,
 query:GitHubArchiveSourceQuery,config:string):Promise<boolean>{
 if(!githubArchiveRelationConfigMatches(config,query))return false;
 return scopedGitHubArchiveRead(pool,scope,async client=>{
  const result=await client.query(scopedGitHubArchiveRelationSql,[scope.tenantId,scope.workspaceId,scope.interestId,
   scope.sourceBindingId,scope.scanPolicyId,config]);
  return result.rows.length===1;
 });
}
// Provider-neutral role verification is intentionally shared; neither function
// grants LOGIN, substitutes a binding, changes finite expiry, or admits an intent.
