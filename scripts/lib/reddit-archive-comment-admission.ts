/** Read-only comments admission inside the caller's existing Serializable transaction. */
import { isDeepStrictEqual } from 'node:util';
import type { RedditArchiveCommentAdmission } from './reddit-archive-comment-dependencies';
import { archiveNeed as need } from './reddit-archive-finite-policy';

// OIDs are resolved from the authenticated catalog, never copied from a receipt.
const authoritySql = `
 WITH stamp AS MATERIALIZED (SELECT pg_catalog.clock_timestamp() AS at)
 SELECT (current_user=session_user AND r.rolname='social_monitor_collection_v2' AND r.rolcanlogin
   AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolcreaterole AND NOT r.rolcreatedb AND NOT r.rolreplication
   AND r.rolvaliduntil>=stamp.at+interval '3 minutes' AND r.rolvaliduntil<=stamp.at+interval '30 minutes'
   AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members WHERE member=r.oid)
   AND pg_catalog.current_setting('social_monitor.tenant_id',true)=$1
   AND pg_catalog.current_setting('social_monitor.workspace_id',true)=$2
   AND pg_catalog.current_setting('social_monitor.system_access',true)='false'
   AND pg_catalog.current_setting('transaction_isolation')='serializable'
   AND pg_catalog.current_setting('row_security')='on'
   AND public.social_monitor_rls_workspace_match($1::uuid,$2::uuid) IS TRUE
   AND public.social_monitor_rls_workspace_match('00000000-0000-0000-0000-000000000000'::uuid,$2::uuid) IS FALSE
   AND public.social_monitor_rls_workspace_match($1::uuid,'00000000-0000-0000-0000-000000000000'::uuid) IS FALSE
   AND (SELECT count(*)=2 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relname IN ('conversation_units','conversation_signal_baseline_samples')
       AND c.relkind='r' AND NOT c.relispartition AND c.relrowsecurity AND c.relforcerowsecurity
       AND NOT pg_catalog.pg_has_role(r.oid,c.relowner,'USAGE')
       AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_inherits WHERE inhrelid=c.oid OR inhparent=c.oid)
       AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid=c.oid AND NOT tgisinternal)
       AND pg_catalog.has_table_privilege(r.oid,c.oid,'SELECT')
       AND (c.relname<>'conversation_units' OR pg_catalog.has_table_privilege(r.oid,c.oid,'INSERT'))
       AND (SELECT count(*)=1 FROM pg_catalog.pg_policy p WHERE p.polrelid=c.oid
         AND p.polname='tenant_isolation' AND p.polcmd='*' AND p.polpermissive AND p.polroles=ARRAY[0::oid]
         AND pg_catalog.pg_get_expr(p.polqual,p.polrelid) IN
           ('social_monitor_rls_workspace_match(tenant_id, workspace_id)','public.social_monitor_rls_workspace_match(tenant_id, workspace_id)')
         AND pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid)=pg_catalog.pg_get_expr(p.polqual,p.polrelid))
       AND (SELECT count(*)=1 FROM pg_catalog.pg_policy WHERE polrelid=c.oid))
   AND EXISTS (SELECT 1 FROM pg_catalog.pg_index i
     WHERE i.indrelid='public.conversation_units'::pg_catalog.regclass
       AND i.indisunique AND i.indisvalid AND i.indisready AND i.indimmediate
       AND i.indpred IS NULL AND i.indexprs IS NULL AND i.indnkeyatts=3
       AND ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY k(attnum,ord)
         JOIN pg_catalog.pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum AND a.attnotnull
         WHERE k.ord<=i.indnkeyatts ORDER BY k.ord)=ARRAY['tenant_id','provider_key','provider_unit_id'])
   AND pg_catalog.has_table_privilege(r.oid,'public.source_items','SELECT')
   AND pg_catalog.has_table_privilege(r.oid,'public.feed_items','SELECT')
 ) AS allowed FROM pg_catalog.pg_roles r CROSS JOIN stamp WHERE r.rolname=current_user`;

const parentSql = `SELECT s.id AS "sourceItemId", f.id AS "feedItemId"
 FROM public.source_items s JOIN public.feed_items f ON f.tenant_id=s.tenant_id AND f.workspace_id=s.workspace_id AND f.source_item_id=s.id
 WHERE s.tenant_id=$1::uuid AND s.workspace_id=$2::uuid AND s.source_binding_id=$3::uuid
 AND s.id='9d1b26ae-ed89-41d5-aaa9-bf786b97c90c' AND s.provider_key='reddit' AND s.provider_item_id='reddit:t3_1wuktlf'
 AND s.published_at='2026-10-01T00:01:13Z' AND f.id='b179076b-4f9e-45d7-8d57-64346600ca90'
 AND f.provider_key='reddit' AND f.source_binding_id=s.source_binding_id AND f.interest_id=$4::uuid AND f.status='VISIBLE'`;

export function createRedditArchiveCommentAdmission(expected: Parameters<RedditArchiveCommentAdmission>[1],
 verifyNativeClaim: () => Promise<void>): RedditArchiveCommentAdmission {
 return async (transaction, plan) => {
  need(isDeepStrictEqual(plan,expected), 'Comments admitted plan changed');
  await verifyNativeClaim();
  const role = await transaction.$queryRawUnsafe<readonly {allowed:boolean}[]>(authoritySql,plan.scope.tenantId,plan.scope.workspaceId);
  need(role.length===1&&role[0]?.allowed===true,'Comments finite identity, expiry, RLS, privileges or uniqueness unavailable');
  const parent = await transaction.$queryRawUnsafe<readonly {sourceItemId:string;feedItemId:string}[]>(parentSql,
   plan.scope.tenantId,plan.scope.workspaceId,plan.scope.sourceBindingId,plan.scope.interestId);
  need(parent.length===1&&parent[0]?.sourceItemId==='9d1b26ae-ed89-41d5-aaa9-bf786b97c90c'
   &&parent[0]?.feedItemId==='b179076b-4f9e-45d7-8d57-64346600ca90','Comments exact visible parent changed');
 };
}
