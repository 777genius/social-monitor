/** Disposable private PostgreSQL only: genuine archived input, synthetic database state. */
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {readGitHubArchiveQualifiedPartition} from './import-github-archive-qualified-partition';
import {pool,setup,url,ROLE} from './backfill/rss-current-postgres-boundary-20261007/setup';
import {execute} from './backfill/rss-current-postgres-boundary-20261007/process';
import {TABLES} from './backfill/rss-current-postgres-boundary-20261007/constants';
import type {GitHubArchivePlannerInput} from './plan-github-archive-qualified-partitions';
import {planGitHubArchiveQualifiedPartition} from './plan-github-archive-qualified-partitions';
const hash=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');

async function main(){
 const name=process.argv[2],database=process.argv[3];
 assert(name==='success'||name==='rollback'||name==='canonical-duplicate'||name==='archive-duplicate'||name==='feed-date-duplicate'||name==='foreign-attempt'||name==='feed-date-duplicate');assert(database);
 assert.equal(process.getuid?.(),0);
 await writeFile('/test/consumed.json',JSON.stringify({name,database,productionAuthority:'NONE'}),{flag:'wx',mode:0o600});
 const raw=await readFile('/input-source/2026-10-09/packet.json'),bytes=await readFile('/input-source/2026-10-09/archive.json');
 const packetSha256=hash(raw),packet=JSON.parse(raw.toString('utf8')) as Omit<GitHubArchivePlannerInput,'bytes'|'qualifiedSha256'>;
 const first=planGitHubArchiveQualifiedPartition({...packet,bytes,qualifiedSha256:packetSha256});
 assert.equal(first.plan.selectedCount,9);assert.equal(first.plan.scope.sourceBindingId,'00000000-0000-7000-8000-000000006111');
 assert.equal(first.plan.scope.scanPolicyId,'00000000-0000-7000-8000-000000006121');
 const root='/test/input',journals='/test/journals',day=first.plan.day;
 await mkdir(root,{mode:0o700});await mkdir(journals,{mode:0o700});await mkdir('/run/social-monitor',{mode:0o700});
 await writeFile(join(root,'packet.json'),raw,{flag:'wx',mode:0o600});
 await writeFile(join(root,'archive.json'),bytes,{flag:'wx',mode:0o600});
 assert.deepEqual(await readGitHubArchiveQualifiedPartition({inputRoot:root,day,semanticKey:first.semanticKey,packetSha256}),first);
 const admin=pool(database),commands:unknown[]=[];
 const snapshot=async()=>{const result:Record<string,unknown>={};for(const table of [...TABLES,'scan_jobs'])
  result[table]=(await admin.query(`SELECT row_to_json(t) AS row FROM public.${table} t ORDER BY row_to_json(t)::text`)).rows;return result;};
 try{
  await setup(admin,first.plan.scope,'TEST-retained-archive-boundary');
  await admin.query(`CREATE TABLE scan_jobs(id uuid PRIMARY KEY,tenant_id uuid NOT NULL,workspace_id uuid NOT NULL);
   ALTER TABLE scan_jobs OWNER TO social_monitor_public_schema_owner;ALTER TABLE scan_jobs ENABLE ROW LEVEL SECURITY;
   ALTER TABLE scan_jobs FORCE ROW LEVEL SECURITY;CREATE POLICY test_gh_jobs_scope ON scan_jobs
   USING(tenant_id::text=current_setting('social_monitor.tenant_id',true) AND workspace_id::text=current_setting('social_monitor.workspace_id',true));
   GRANT SELECT ON scan_jobs TO ${ROLE};`);
  await admin.query("UPDATE source_catalog_entries SET provider_key='github-trending-page'");
  await admin.query('UPDATE source_bindings SET config=$1::jsonb WHERE id=$2::uuid',[first.plan.bindingConfig,first.plan.scope.sourceBindingId]);
  await admin.query(`REVOKE ALL ON tenants,workspaces,interests,source_bindings,source_catalog_entries,scan_policies FROM ${ROLE};
   GRANT SELECT(id,deleted_at) ON tenants TO ${ROLE};GRANT SELECT(id,tenant_id,deleted_at) ON workspaces TO ${ROLE};
   GRANT SELECT ON interests,source_bindings,source_catalog_entries,scan_policies TO ${ROLE};`);
  const run=async()=>{
   const correlationId='TEST-'+randomUUID();const claim=Buffer.from(JSON.stringify({mode:'import-github-archive-missing',inputRoot:root,day,
    journalDir:journals,semanticKey:first.semanticKey,planSha256:first.plan.planSha256,packetSha256,correlationId}));
   await writeFile('/run/social-monitor/github-archive-import-claim.json',claim,{mode:0o600});
   const result=await execute(process.execPath,['/app/dist/scripts/import-github-archive-qualified-partition.js','--native-write',root,day,journals,
    first.semanticKey,first.plan.planSha256,packetSha256,correlationId,hash(claim)],'/app',
    {PATH:'/usr/local/bin:/usr/bin:/bin',HOME:'/test',NODE_ENV:'test',DATABASE_URL:url(database,ROLE)},150000);
   commands.push(result);return result;
  };
  await admin.query("UPDATE source_bindings SET status='PAUSED'");const disabledBefore=await snapshot();
  assert.notEqual((await run()).exit,0);assert.deepEqual(await snapshot(),disabledBefore);
  await assert.rejects(readFile(join(journals,first.journalFilename)),(error:unknown)=>(error as {code?:string}).code==='ENOENT');
  await admin.query("UPDATE source_bindings SET status='ENABLED'");
  if(name==='canonical-duplicate'||name==='archive-duplicate'||name==='feed-date-duplicate'){
   const seed=pool(database,ROLE);try{
   await seed.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
   await seed.query("SELECT set_config('social_monitor.tenant_id',$1,true),set_config('social_monitor.workspace_id',$2,true),set_config('social_monitor.system_access','false',true)",[first.plan.scope.tenantId,first.plan.scope.workspaceId]);
   const candidate=first.plan.candidates[0]!,sourceId=randomUUID();
   await seed.query(`INSERT INTO source_items(id,tenant_id,workspace_id,source_binding_id,provider_key,provider_item_id,canonical_url,
    title,body,published_at,content_hash,provider_content_hash,observed_at,metadata,schema_version,created_at)
    VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,'github-trending-page',$5,$6,'Synthetic retained GitHub title','Synthetic retained immutable body',
    $7,$8,$8,$7,$9::jsonb,1,now())`,[sourceId,first.plan.scope.tenantId,first.plan.scope.workspaceId,first.plan.scope.sourceBindingId,
    name==='canonical-duplicate'?'github-trending-page:daily:synthetic-old-native-scan:retained':candidate.externalId+':other-immutable-capture',
    candidate.item.canonicalUrl.toUpperCase()+'/',name==='feed-date-duplicate'?new Date(candidate.item.publishedAt.getTime()-86400000):candidate.item.publishedAt,hash('synthetic retained GitHub row'),
    JSON.stringify(name==='canonical-duplicate'?{kind:'github_trending_page_repository',trending:{observationKind:'live'}}:candidate.item.metadata)]);
   if(name==='feed-date-duplicate')await seed.query(`INSERT INTO feed_items(id,tenant_id,workspace_id,interest_id,source_item_id,source_binding_id,provider_key,
    dedupe_key,canonical_url,title,body_preview,published_at,observed_at,provider_metadata,status,created_at,updated_at)
    VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,'github-trending-page',$7,$8,'Synthetic existing feed title',
    'Synthetic retained immutable feed body',$9,$9,'{}'::jsonb,'VISIBLE',now(),now())`,[randomUUID(),first.plan.scope.tenantId,
    first.plan.scope.workspaceId,first.plan.scope.interestId,sourceId,first.plan.scope.sourceBindingId,randomUUID(),
    candidate.item.canonicalUrl,candidate.item.publishedAt]);
     await seed.query('COMMIT');
   }finally{await seed.end();}
  }
  if(name==='foreign-attempt'){
   const b=createHash('sha256').update('github-archive-qualified:'+first.semanticKey).digest().subarray(0,16);
   b[6]=(b[6]!&15)|64;b[8]=(b[8]!&63)|128;const h=b.toString('hex'),job=h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
   await admin.query(`INSERT INTO scan_attempts(scan_job_id,tenant_id,workspace_id,source_binding_id,attempt_number,status,
    started_at,fetched,inserted,skipped_duplicates,projected,updated_at) VALUES($1::uuid,
    '00000000-0000-7000-8000-000000006201','00000000-0000-7000-8000-000000006202',
    '00000000-0000-7000-8000-000000006212',1,'RUNNING',now(),0,0,0,0,now())`,[job]);
  }
  if(name==='rollback')await admin.query(`CREATE FUNCTION test_fail_archive_feed() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog
   AS $f$ BEGIN RAISE EXCEPTION 'Synthetic TEST mid-transaction failure'; END $f$;
   CREATE TRIGGER test_fail_archive_feed BEFORE INSERT ON feed_items FOR EACH ROW EXECUTE FUNCTION test_fail_archive_feed();`);
  const before=await snapshot(),initial=await run();
  if(name!=='success'){
   assert.notEqual(initial.exit,0);assert.deepEqual(await snapshot(),before);
   assert.equal(JSON.parse(await readFile(join(journals,first.journalFilename),'utf8')).status,'started');
  }else{
   assert.equal(initial.exit,0,initial.stderr);assert.deepEqual(JSON.parse(initial.stdout),{coverage:'PARTIAL_ARCHIVED_OBSERVATIONS',
    planSha256:first.plan.planSha256,inserted:9,alreadyPresent:0,postWritePresent:9});
   const count=(await admin.query(`SELECT (SELECT count(*)::int FROM source_items WHERE provider_key='github-trending-page') AS sources,
    (SELECT count(*)::int FROM feed_items WHERE provider_key='github-trending-page') AS feeds`)).rows[0];assert.deepEqual(count,{sources:9,feeds:9});
   const rows=(await admin.query(`SELECT metadata,published_at AS publication,observed_at AS ingestion FROM source_items WHERE provider_key='github-trending-page'`)).rows;
   assert(rows.every(row=>row.metadata.trending.scanJobId===null&&row.metadata.trending.fetchStartedAt===null&&row.metadata.trending.checkedAt===null&&
    row.publication.toISOString()===packet.archive.serializedAt&&row.ingestion.getTime()>=Date.parse(packet.archive.acquiredAt)));
   const terminal=await snapshot();for(const table of [...TABLES,'scan_jobs'])for(const retained of before[table] as unknown[])
    assert((terminal[table] as unknown[]).some(row=>JSON.stringify(row)===JSON.stringify(retained)),table+' retained row mutated');
   assert.equal(JSON.parse(await readFile(join(journals,first.journalFilename),'utf8')).status,'complete');
   assert((await admin.query('SELECT isolation FROM test_identity')).rows.every(row=>row.isolation==='serializable'));
  }
  const terminal=await snapshot();assert.notEqual((await run()).exit,0);assert.deepEqual(await snapshot(),terminal);
  assert.equal((await admin.query('SELECT count(*)::int AS count FROM pg_stat_activity WHERE usename=$1',[ROLE])).rows[0].count,0);
  await admin.query(`ALTER ROLE ${ROLE} NOLOGIN`);assert.equal((await admin.query('SELECT rolcanlogin FROM pg_roles WHERE rolname=$1',[ROLE])).rows[0].rolcanlogin,false);
  await writeFile('/test/evidence.json',JSON.stringify({status:'passed',name,commands,productionAuthority:'NONE',oldRowsPreserved:true,
   replayRefused:true,clientsClosed:true,testRoleClosed:true,packetSha256},null,2),{flag:'wx',mode:0o600});
  console.log(JSON.stringify({status:'passed',name,oldRowsPreserved:true,replayRefused:true,clientsClosed:true,testRoleClosed:true}));
 }finally{await admin.end();}
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
